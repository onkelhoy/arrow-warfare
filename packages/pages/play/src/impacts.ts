import type { Vec } from "@arrow-warfare/archery";
import { MeshBuilder, type Batch, type Renderer, type Vec3 } from "@arrow-warfare/render";
import type { Field } from "@arrow-warfare/world";

export type Surface = "ground" | "wood" | "wall";

type Bit = { x: number; y: number; z: number; vx: number; vy: number; vz: number; age: number; life: number; size: number; grow: number; drag: number; colour: number };
type Mark = { x: number; y: number; z: number; yaw: number; pitch: number; age: number; size: number };

const GRAVITY = 9.8;
/** Bits in the air at once, and marks left before the oldest goes. */
const BITS = 400;
const MARKS = 80;
/** Seconds a mark stays, the last few it shrinks away. */
const MARK_LIFE = 30;
const MARK_FADE = 4;

/** Chips, dust and grit, by what was hit. */
const COLOURS: Record<Surface, Vec3[]> = {
    ground: [[.4, .3, .19], [.33, .25, .16], [.5, .42, .3]],
    wood: [[.78, .6, .38], [.62, .45, .27], [.55, .5, .45]],
    wall: [[.4, .3, .19], [.3, .36, .2], [.5, .42, .3]],
};
const PALETTE = [...COLOURS.ground, ...COLOURS.wood, ...COLOURS.wall];

/**
 * Where a bullet hits the field: a puff of chips and dust thrown back out, and a small dark hole left on
 * the surface that fades after a while.
 */
export class Impacts {
    private bits: Bit[] = [];
    private marks: Mark[] = [];
    private chips: Batch;
    private holes: Batch;

    constructor(private renderer: Renderer, private field: Field) {
        this.chips = renderer.batch(new MeshBuilder().box("#ffffff", { tint: 1 }).build(), { capacity: BITS, dynamic: true, emissive: .2 });
        this.holes = renderer.batch(new MeshBuilder().cylinder("#1c1712", { scale: [1, 1, 1] }, 7).build(), { capacity: MARKS, dynamic: true });
        for (let i = 0; i < MARKS; i++) this.holes.tint(i, [1, 1, 1]);
    }

    /** A bullet going along `direction` stopped at `at` in `surface`. */
    hit(at: Vec, direction: Vec, surface: Surface) {
        const length = Math.hypot(direction[0], direction[1], direction[2]) || 1;
        const d = [direction[0] / length, direction[1] / length, direction[2] / length];
        const colours = COLOURS[surface];
        const base = PALETTE.indexOf(colours[0]);
        // out of the hole: back towards the shooter for a wall or trunk, up for the ground
        const out = surface === "ground" ? [0, 1, 0] : [-d[0], Math.max(.2, -d[1]), -d[2]];
        for (let i = 0; i < 16; i++)
        {
            const dust = i < 6;
            const speed = dust ? .4 + Math.random() * .5 : 1.6 + Math.random() * 2.4;
            const spread = dust ? .6 : 1.1;
            this.bits.push({
                x: at[0] - d[0] * .02, y: at[1] - d[1] * .02, z: at[2] - d[2] * .02,
                vx: (out[0] + (Math.random() - .5) * spread) * speed,
                vy: (out[1] + Math.random() * .6) * speed,
                vz: (out[2] + (Math.random() - .5) * spread) * speed,
                age: 0,
                life: dust ? 1 + Math.random() * .6 : .45 + Math.random() * .35,
                size: dust ? .05 + Math.random() * .04 : .02 + Math.random() * .025,
                grow: dust ? 1.8 : 0,
                drag: dust ? 3 : .5,
                colour: base + Math.floor(Math.random() * colours.length),
            });
        }
        if (this.bits.length > BITS) this.bits.splice(0, this.bits.length - BITS);

        if (surface === "wall") return;
        // the hole lies on the surface: flat on the ground, facing the shot on a trunk or a wall
        const ground = this.field.height(at[0], at[2]);
        const flat = surface === "ground" || at[1] - ground < .02;
        this.marks.push({
            x: at[0] - (flat ? 0 : d[0] * .015), y: flat ? ground + .012 : at[1], z: at[2] - (flat ? 0 : d[2] * .015),
            yaw: Math.atan2(d[0], d[2]), pitch: flat ? 0 : Math.PI / 2,
            age: 0, size: .07 + Math.random() * .03,
        });
        if (this.marks.length > MARKS) this.marks.shift();
    }

    /** `dt` already slowed in slow motion. */
    update(dt: number) {
        let index = 0;
        this.bits = this.bits.filter(bit => (bit.age += dt) < bit.life);
        for (const bit of this.bits)
        {
            const slow = Math.exp(-bit.drag * dt);
            bit.vx *= slow; bit.vz *= slow;
            bit.vy = bit.vy * slow - GRAVITY * dt * (bit.grow ? .08 : 1);
            bit.x += bit.vx * dt; bit.y += bit.vy * dt; bit.z += bit.vz * dt;
            const ground = this.field.height(bit.x, bit.z);
            if (bit.y < ground) { bit.y = ground; bit.vy = 0; bit.vx *= .5; bit.vz *= .5; }
            const k = bit.age / bit.life;
            const size = bit.size * (bit.grow ? 1 + k * bit.grow : 1 - k * .5) * (bit.grow ? 1 - k * k : 1);
            this.chips.place(index, bit.x, bit.y, bit.z, bit.age * 9, bit.age * 7, 0, size);
            this.chips.tint(index++, PALETTE[bit.colour], bit.grow ? .9 : 1);
        }
        this.chips.count = index;

        index = 0;
        this.marks = this.marks.filter(mark => (mark.age += dt) < MARK_LIFE);
        for (const mark of this.marks)
        {
            const s = mark.size * Math.min(1, (MARK_LIFE - mark.age) / MARK_FADE);
            // a thin disc: flat on the ground, or stood up facing the shot
            this.holes.place(index++, mark.x, mark.y, mark.z, mark.yaw, mark.pitch, 0, s, .004, s);
        }
        this.holes.count = index;
    }

    destroy() {
        this.renderer.removeBatch(this.chips);
        this.renderer.removeBatch(this.holes);
    }
}
