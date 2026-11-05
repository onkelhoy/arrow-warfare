import type { Vec } from "@arrow-warfare/archery";
import { MeshBuilder, type Batch, type Renderer } from "@arrow-warfare/render";
import type { Field } from "@arrow-warfare/world";

/** Drops at most, the oldest go first. */
const MOST = 220;
/** Seconds a splat on the grass lasts. */
const SPLAT_LIFE = 9;
const GRAVITY = 9.81;

type Drop = { x: number; y: number; z: number; vx: number; vy: number; vz: number; size: number; landed: number; spin: number };

/**
 * A little blood on a hit: drops spray out along the arrow (and a few back), fall and lie on the grass as
 * small splats that fade. Time can be slowed down, so in slow motion the drops hang in the air.
 */
export class Blood {
    private drops: Drop[] = [];
    private batch: Batch;

    constructor(private renderer: Renderer, private field: Field) {
        this.batch = renderer.batch(new MeshBuilder().ball("#8e0f16", {}, 0).build(), { capacity: MOST, dynamic: true, emissive: .25 });
        for (let i = 0; i < MOST; i++) this.batch.tint(i, [1, 1, 1]);
    }

    /** A hit at `at`, the arrow going along `direction`. `strength` 0..1 is how hard. */
    spray(at: Vec, direction: Vec, strength: number) {
        const count = Math.round(10 + 14 * strength);
        for (let i = 0; i < count; i++)
        {
            // most go on with the arrow, a few splash back out of the wound
            const back = i % 4 === 0 ? -.5 : 1;
            const speed = (1.2 + Math.random() * 2.6) * (.6 + strength * .6);
            const spread = .9;
            this.drops.push({
                x: at[0], y: at[1], z: at[2],
                vx: direction[0] * speed * back + (Math.random() - .5) * spread * speed,
                vy: direction[1] * speed * back + (Math.random() - .2) * spread * speed,
                vz: direction[2] * speed * back + (Math.random() - .5) * spread * speed,
                size: .007 + Math.random() * .013,
                landed: -1,
                spin: Math.random() * Math.PI * 2,
            });
        }
        if (this.drops.length > MOST) this.drops.splice(0, this.drops.length - MOST);
    }

    /** `dt` already slowed down in slow motion. */
    update(dt: number) {
        let index = 0;
        this.drops = this.drops.filter(drop => drop.landed < SPLAT_LIFE);
        for (const drop of this.drops)
        {
            if (drop.landed < 0)
            {
                drop.vy -= GRAVITY * dt;
                drop.x += drop.vx * dt;
                drop.y += drop.vy * dt;
                drop.z += drop.vz * dt;
                const ground = this.field.height(drop.x, drop.z);
                if (drop.y <= ground + .01)
                {
                    drop.y = ground + .01;
                    drop.landed = 0;
                }
                // stretched a little along the fall
                const speed = Math.hypot(drop.vx, drop.vy, drop.vz);
                const yaw = Math.atan2(-drop.vx, -drop.vz), pitch = Math.asin(Math.max(-1, Math.min(1, drop.vy / (speed || 1))));
                const s = drop.size;
                this.batch.place(index++, drop.x, drop.y, drop.z, yaw, pitch, 0, s, s, s * (1 + Math.min(2, speed * .25)));
                continue;
            }
            drop.landed += dt;
            // a flat splat that shrinks away at the end
            const fade = Math.min(1, (SPLAT_LIFE - drop.landed) / 2);
            const s = drop.size * 1.6 * fade;
            this.batch.place(index++, drop.x, drop.y, drop.z, drop.spin, 0, 0, s, s * .08, s * 1.3);
        }
        this.batch.count = index;
    }

    clear() {
        this.drops = [];
        this.batch.count = 0;
    }

    destroy() {
        this.renderer.removeBatch(this.batch);
    }
}
