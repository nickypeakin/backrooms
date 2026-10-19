// Everything is seen through an old camcorder: the scene renders at a low
// resolution into a texture, then one full-screen pass adds tape wobble,
// colour bleed, scanlines, grain and, when things go wrong, static.

import * as THREE from 'three';

const vertexShader = /* glsl */`
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const fragmentShader = /* glsl */`
  uniform sampler2D tDiffuse;
  uniform vec2 res;
  uniform float time, glitch, noise, staticAmt, fade, warp;
  uniform vec3 fadeColor;
  varying vec2 vUv;

  float h(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

  void main() {
    vec2 uv = vUv;
    vec2 c = uv - 0.5;
    uv = 0.5 + c * (1.0 + 0.045 * dot(c, c) + warp * 0.12 * sin(time * 2.0 + c.y * 6.0));

    // tape wobble: every line shifts a little, a tracking band rolls by
    float line = floor(uv.y * res.y * 0.5);
    float j = (h(vec2(line, floor(time * 24.0))) - 0.5) * (0.0012 + glitch * 0.03);
    float band = fract(time * 0.07);
    float inBand = smoothstep(0.03, 0.0, abs(uv.y - band));
    j += inBand * 0.006 * sin(time * 40.0 + uv.y * 300.0);
    // big torn blocks when glitching
    float blockRow = floor(uv.y * 14.0);
    float tear = step(1.0 - glitch * 0.45, h(vec2(blockRow, floor(time * 18.0))));
    j += tear * (h(vec2(blockRow, time)) - 0.5) * 0.18 * glitch;
    uv.x += j;

    float ca = 0.0018 + glitch * 0.012 + warp * 0.006;
    vec3 col;
    col.r = texture2D(tDiffuse, uv + vec2(ca, 0.0)).r;
    col.g = texture2D(tDiffuse, uv).g;
    col.b = texture2D(tDiffuse, uv - vec2(ca, 0.0)).b;
    // soft horizontal smear, like composite video
    col = mix(col, texture2D(tDiffuse, uv - vec2(0.004, 0.0)).rgb, 0.25);

    // camcorder colour: lifted blacks, a little washed out
    float lum = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(vec3(lum), col, 0.86);
    col = col * 0.94 + 0.018;

    col *= 0.93 + 0.07 * sin(vUv.y * res.y * 3.14159);
    col += (h(vUv * res + fract(time) * 100.0) - 0.5) * (0.05 + noise);
    col += inBand * 0.04;

    float s = h(vUv * res * 0.5 + floor(time * 30.0));
    col = mix(col, vec3(s * 0.9), clamp(staticAmt, 0.0, 1.0));

    float vig = smoothstep(0.85, 0.25, length(c * vec2(1.0, 0.85)));
    col *= mix(0.55, 1.0, vig);
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) col = vec3(0.0);

    col = mix(col, fadeColor, clamp(fade, 0.0, 1.0));
    gl_FragColor = vec4(max(col, 0.0), 1.0);
    #include <colorspace_fragment>
  }
`;

export class VHS {
  constructor(renderer) {
    this.renderer = renderer;
    this.target = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, depthBuffer: true });
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
    };
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader, fragmentShader, depthTest: false, depthWrite: false,
    }));
    this.quad.frustumCulled = false;
    this.post = new THREE.Scene();
    this.post.add(this.quad);
    this.postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }

  // Internal resolution stays low on purpose: it's a 90s camcorder.
  setSize(w, h) {
    const scale = Math.min(1, 560 / h);
    const rw = Math.max(2, Math.round(w * scale)), rh = Math.max(2, Math.round(h * scale));
    this.target.setSize(rw, rh);
    this.uniforms.res.value.set(rw, rh);
  }

  render(scene, camera, fx) {
    const u = this.uniforms;
    u.time.value = fx.time;
    u.glitch.value = fx.glitch || 0;
    u.noise.value = fx.noise || 0;
    u.staticAmt.value = fx.staticAmt || 0;
    u.fade.value = fx.fade || 0;
    u.warp.value = fx.warp || 0;
    if (fx.fadeColor != null) u.fadeColor.value.set(fx.fadeColor);
    const r = this.renderer;
    r.setRenderTarget(this.target);
    r.render(scene, camera);
    r.setRenderTarget(null);
    r.render(this.post, this.postCam);
  }
}
