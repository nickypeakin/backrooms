// The furniture store where every match starts (the opening cutscene plays
// out here): a showroom full of display rooms, and a back hallway to the
// stockroom with a wet floor nobody mopped. Front of the store is +z, the
// hallway runs off the back wall towards -z. Furniture is modelled facing
// +z; `rot` turns it about the vertical axis.

export const SHOWROOM = { x0: -14, x1: 14, z0: -10, z1: 10 };
export const HALL = { x0: -1.3, x1: 1.3, z0: -22, z1: -10 };
export const BACK_DOOR = { x0: -0.9, x1: 0.9 };

export const SPAWNS = [
  { x: -3, z: 7.4 }, { x: -1, z: 8.2 }, { x: 1, z: 8.2 }, { x: 3, z: 7.4 },
];

// the puddle, and the stretch of hallway wall that stops being solid
export const SPILL = { cx: -0.25, cz: -16.5 };
export const HOLE = { x: -1.3, z: -16.5, z0: -17.25, z1: -15.75, h: 2.1 };

export const FURNITURE = [
  // living room display (front left)
  { type: 'rug', x: -8, z: 5.6, w: 4.2, d: 3.2, color: 0x7a3b2e },
  { type: 'sofa', x: -8, z: 7.5, rot: Math.PI, color: 0x5d6b78 },
  { type: 'coffeeTable', x: -8, z: 5.5 },
  { type: 'armchair', x: -10.7, z: 5.3, rot: Math.PI / 2, color: 0x8c6d4f },
  { type: 'floorLamp', x: -5.5, z: 7.7 },
  { type: 'tvStand', x: -8, z: 3.2 },
  { type: 'plant', x: -12.9, z: 8.8 },
  { type: 'price', x: -6.4, z: 7.0, text: '$899' },
  // bedroom display (middle left)
  { type: 'rug', x: -11.6, z: -0.6, w: 3.4, d: 3.6, color: 0x4b5d4a },
  { type: 'bed', x: -12.85, z: -0.6, rot: Math.PI / 2, color: 0xe6e1d6 },
  { type: 'nightstand', x: -13.65, z: -1.95, rot: Math.PI / 2 },
  { type: 'nightstand', x: -13.65, z: 0.75, rot: Math.PI / 2 },
  { type: 'dresser', x: -6.5, z: -2.9 },
  { type: 'price', x: -9.6, z: 0.9, text: '$1,249' },
  // dining display (back left)
  { type: 'rug', x: -8, z: -6.8, w: 4, d: 3, color: 0x6b5a3a },
  { type: 'diningTable', x: -8, z: -6.8 },
  { type: 'chair', x: -8.6, z: -6.0, rot: Math.PI },
  { type: 'chair', x: -7.4, z: -6.0, rot: Math.PI },
  { type: 'chair', x: -8.6, z: -7.6 },
  { type: 'chair', x: -7.4, z: -7.6 },
  { type: 'chair', x: -9.4, z: -6.8, rot: Math.PI / 2 },
  { type: 'chair', x: -6.6, z: -6.8, rot: -Math.PI / 2 },
  { type: 'sideboard', x: -8, z: -9.6 },
  { type: 'price', x: -6.1, z: -6.2, text: '$649' },
  // sectional display (front right)
  { type: 'rug', x: 8, z: 5.4, w: 4.4, d: 3.4, color: 0x2f4058 },
  { type: 'sofa', x: 8, z: 7.5, rot: Math.PI, color: 0xb9a68a },
  { type: 'sofa', x: 10.6, z: 5.3, rot: -Math.PI / 2, color: 0xb9a68a },
  { type: 'coffeeTable', x: 7.8, z: 5.3 },
  { type: 'plant', x: 5.6, z: 7.9 },
  { type: 'price', x: 6.1, z: 6.6, text: '$1,599' },
  // checkout
  { type: 'counter', x: 9.5, z: 9.1 },
  // home office display (middle right)
  { type: 'desk', x: 8, z: 0.6, rot: Math.PI },
  { type: 'officeChair', x: 8, z: -0.3 },
  { type: 'bookshelf', x: 10.6, z: 1.6, rot: -Math.PI / 2 },
  { type: 'bookshelf', x: 10.6, z: -0.2, rot: -Math.PI / 2 },
  { type: 'floorLamp', x: 5.9, z: 1.6 },
  { type: 'price', x: 6.4, z: -0.4, text: '$379' },
  // bedroom display (back right)
  { type: 'rug', x: 11.4, z: -6.3, w: 3.6, d: 3.8, color: 0x7d6a8c },
  { type: 'bed', x: 12.85, z: -6.3, rot: -Math.PI / 2, color: 0xcfd8e0 },
  { type: 'nightstand', x: 13.65, z: -7.55, rot: -Math.PI / 2 },
  { type: 'nightstand', x: 13.65, z: -5.05, rot: -Math.PI / 2 },
  { type: 'wardrobe', x: 13.55, z: -1.8, rot: -Math.PI / 2 },
  { type: 'price', x: 9.7, z: -4.6, text: '$1,099' },
  // back wall shelving
  { type: 'bookshelf', x: 4.4, z: -9.6 },
  { type: 'bookshelf', x: 5.6, z: -9.6 },
  { type: 'plant', x: -3.0, z: -9.4 },
  { type: 'plant', x: 3.0, z: -9.4 },
  // decor
  { type: 'art', x: -14, z: 6.2, rot: Math.PI / 2, y: 1.75, w: 1.3, h: 0.95, seed: 0 },
  { type: 'art', x: -14, z: -6.8, rot: Math.PI / 2, y: 1.75, w: 1.0, h: 1.3, seed: 1 },
  { type: 'art', x: 14, z: 2.6, rot: -Math.PI / 2, y: 1.75, w: 1.4, h: 1.0, seed: 2 },
  { type: 'art', x: -8, z: -10, y: 1.95, w: 1.6, h: 0.9, seed: 3 },
  { type: 'art', x: 9.2, z: -10, y: 1.85, w: 1.1, h: 1.1, seed: 4 },
  { type: 'pendant', x: -8.45, z: -6.8, h: 3.6 },
  { type: 'pendant', x: -7.55, z: -6.8, h: 3.6 },
  { type: 'deptSign', x: -4.6, z: 5.6, rot: Math.PI / 2, h: 3.6, text: 'LIVING ROOM' },
  { type: 'deptSign', x: -4.6, z: -0.7, rot: Math.PI / 2, h: 3.6, text: 'BEDROOMS' },
  { type: 'deptSign', x: -4.6, z: -6.8, rot: Math.PI / 2, h: 3.6, text: 'DINING' },
  { type: 'deptSign', x: 4.6, z: 5.4, rot: -Math.PI / 2, h: 3.6, text: 'SECTIONALS' },
  { type: 'deptSign', x: 4.6, z: 0.5, rot: -Math.PI / 2, h: 3.6, text: 'HOME OFFICE' },
  { type: 'deptSign', x: 4.6, z: -6.3, rot: -Math.PI / 2, h: 3.6, text: 'BEDROOMS' },
  { type: 'plant', x: 12.9, z: 8.8 },
  { type: 'plant', x: -12.9, z: -9.3 },
  // the hallway
  { type: 'wetSign', x: 0.8, z: -15.0, rot: -0.4 },
  { type: 'boxes', x: 0.85, z: -20.6 },
  { type: 'boxes', x: -0.85, z: -12.2, rot: 0.3 },
];
