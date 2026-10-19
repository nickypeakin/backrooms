// The final picture. The scene renders at full resolution (with
// anti-aliasing) into a texture, then one full-screen pass adds a light
// camcorder look (a touch of grain, colour fringe and vignette, which the
// settings can turn off), letterbox bars for cutscenes, and the heavy stuff
// when things go wrong: tape tearing, static, fades.

import * as THREE from 'three';

const vertexShader = /* glsl */`
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const fragmentShader = /* glsl */`
  uniform sampler2D tDiffuse;
  uniform vec2 res;
  uniform float time, glitch, noise, staticAmt, fade, warp, look, tone, exposure, bars;
  uniform vec3 fadeColor;
  varying vec2 vUv;

  float h(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

  // filmic curve (ACES fit) for scenes lit like the real world
  vec3 aces(vec3 x) {
    return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
  }

  void main() {
    vec2 uv = vUv;
    vec2 c = uv - 0.5;
    uv = 0.5 + c * (1.0 + look * 0.015 * dot(c, c) + warp * 0.12 * sin(time * 2.0 + c.y * 6.0));

    // tape trouble: only when something is wrong
    float line = floor(uv.y * 270.0);
    float j = (h(vec2(line, floor(time * 24.0))) - 0.5) * glitch * 0.03;
    float blockRow = floor(uv.y * 14.0);
    float tear = step(1.0 - glitch * 0.45, h(vec2(blockRow, floor(time * 18.0))));
    j += tear * (h(vec2(blockRow, time)) - 0.5) * 0.18 * glitch;
    uv.x += j;

    float ca = look * 0.0006 + glitch * 0.012 + warp * 0.006;
    vec3 col;
    col.r = texture2D(tDiffuse, uv + vec2(ca, 0.0)).r;
    col.g = texture2D(tDiffuse, uv).g;
    col.b = texture2D(tDiffuse, uv - vec2(ca, 0.0)).b;

    if (tone > 0.5) col = aces(col * exposure);

    // a little camcorder: slightly warm, lifted blacks, fine grain
    col = mix(col, col * vec3(1.02, 1.0, 0.96) * 0.97 + 0.012, look);
    col += (h(vUv * res + fract(time) * 100.0) - 0.5) * (0.022 * look + noise);

    float s = h(vUv * res * 0.5 + floor(time * 30.0));
    col = mix(col, vec3(s * 0.9), clamp(staticAmt, 0.0, 1.0));

    float vig = smoothstep(0.95, 0.3, length(c * vec2(1.0, 0.85)));
    col *= mix(1.0, mix(0.72, 1.0, vig), look);
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) col = vec3(0.0);

    col = mix(col, fadeColor, clamp(fade, 0.0, 1.0));
    float bar = bars * 0.11;
    if (vUv.y < bar || vUv.y > 1.0 - bar) col = vec3(0.0);
    gl_FragColor = vec4(max(col, 0.0), 1.0);
    #include <colorspace_fragment>
  }
`;

export class VHS {
  constructor(renderer) {
    this.renderer = renderer;
    this.look = 1;
    this.target = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 });
    this.uniforms = {
      tDiffuse: { value: this.target.texture },
      res: { value: new THREE.Vector2(4, 4) },
      time: { value: 0 },
      glitch: { value: 0 },
      noise: { value: 0 },
      staticAmt: { value: 0 },
      fade: { value: 0 },
      fadeColor: { value: new THREE.Color(0, 0, 0) },
      warp: { value: 0 },
      look: { value: 1 },
      tone: { value: 0 },
      exposure: { value: 1 },
      bars: { value: 0 },
    };
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader, fragmentShader, depthTest: false, depthWrite: false,
    }));
    this.quad.frustumCulled = false;
    this.post = new THREE.Scene();
    this.post.add(this.quad);
    this.postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }

  // Full resolution (up to 1.5x on high-density screens) times `quality`,
  // which drops on computers that can't keep up.
  setSize(w, h, quality = 1) {
    this.w = w;
    this.h = h;
    const scale = Math.min(window.devicePixelRatio || 1, 1.5) * quality;
    const rw = Math.max(2, Math.round(w * scale)), rh = Math.max(2, Math.round(h * scale));
    this.target.setSize(rw, rh);
    this.uniforms.res.value.set(rw, rh);
    this.renderer.setPixelRatio(scale);
    this.renderer.setSize(w, h, false);
  }

  render(scene, camera, fx) {
    const u = this.uniforms;
    u.time.value = fx.time;
    u.glitch.value = fx.glitch || 0;
    u.noise.value = fx.noise || 0;
    u.staticAmt.value = fx.staticAmt || 0;
    u.fade.value = fx.fade || 0;
    u.warp.value = fx.warp || 0;
    u.look.value = this.look;
    u.tone.value = fx.tone ? 1 : 0;
    u.exposure.value = fx.exposure ?? 1;
    u.bars.value = fx.bars || 0;
    if (fx.fadeColor != null) u.fadeColor.value.set(fx.fadeColor);
    const r = this.renderer;
    r.setRenderTarget(this.target);
    r.render(scene, camera);
    r.setRenderTarget(null);
    r.render(this.post, this.postCam);
  }
}
