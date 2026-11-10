import { compose, mat4, MeshBuilder, multiply, type Batch, type MeshData, type Renderer, type Vec3 } from "@arrow-warfare/render";
import { arrow, ARROW_LENGTH, blob, bow, head } from "@arrow-warfare/world";

import { MEASURE, type Rig } from "./rig";

/** The body's parts as low poly models. Parts with `tint: 1` take the clothes colour, or the skin. */

const TROUSERS = "#3b3a4a";
const BOOTS = "#2c2a25";
const BELT = "#5a3a22";

const SHIRT = "#efe3c8";
const LEATHER = "#7a4a26";

/** The big torso, the hips at 0, facing -z: a tunic with round shoulders, a belt, a quiver on the back. */
export function torso(): MeshData {
    const builder = new MeshBuilder()
        .cylinder("#ffffff", { at: [0, -.07, 0], scale: [.62, .73, .5], tint: 1 }, 8, .5, .42)
        // the shirt's collar showing at the neck, round shoulders in the tunic's colour
        .cylinder(SHIRT, { at: [0, .6, 0], scale: [.3, .07, .26] }, 8, .5, .42)
        .ball("#ffffff", { at: [-.27, .55, 0], scale: [.13, .1, .13], tint: 1 }, 1)
        .ball("#ffffff", { at: [.27, .55, 0], scale: [.13, .1, .13], tint: 1 }, 1)
        .box(BELT, { at: [0, .17, 0], scale: [.6, .07, .46] })
        .box("#d8b44a", { at: [0, .17, -.235], scale: [.08, .06, .02] })
        .ball(TROUSERS, { at: [0, -.03, 0], scale: [.28, .12, .22] }, 1)
        // the quiver's strap across the chest, the quiver leaning on the back with feathers out of it
        .box(LEATHER, { at: [0, .42, -.215], roll: .75, scale: [.05, .6, .02] })
        .cylinder(LEATHER, { at: [.08, .18, .27], roll: .3, scale: [.13, .55, .13] }, 6);
    for (let i = 0; i < 3; i++)
        builder.box(i === 1 ? "#d84a3a" : "#f2efe6", { at: [-.06 + i * .04 - .1, .78 + i * .015, .27 + (i - 1) * .025], roll: .3, scale: [.012, .1, .04] });
    return builder.build();
}

/** A limb from 0 to 1 along +x, stretched to the bone's length. */
export function limb(colour: string, radius: number, tint = 0): MeshData {
    return new MeshBuilder()
        .cylinder(colour, { roll: -Math.PI / 2, scale: [radius * 2, 1, radius * 2], tint }, 6, .5, .45)
        .build();
}

/** A hand: a round palm and a thumb. */
export function palm(): MeshData {
    return new MeshBuilder()
        .ball("#ffffff", { scale: [.055, .06, .06], tint: 1 }, 1)
        .ball("#ffffff", { at: [.035, .02, -.035], scale: [.022, .022, .03], tint: 1 }, 0)
        .build();
}

/** A boot, the ankle at 0, toes along -z. */
export function boot(): MeshData {
    return new MeshBuilder()
        .box(BOOTS, { at: [0, -.015, -.05], scale: [.16, .08, .25] })
        .ball(BOOTS, { at: [0, -.02, -.15], scale: [.08, .045, .07] }, 0)
        .build();
}

type Look = { clothes: Vec3; skin: Vec3 };

/**
 * Draws any number of rigs, each part kind in one instanced batch, with their bows and nocked arrows. Call
 * `draw` once a frame with everyone to show.
 */
export class Bodies {
    private torsos: Batch;
    private heads: Batch;
    private deadHeads: Batch;
    private arms: Batch;
    private legs: Batch;
    private hands: Batch;
    private feet: Batch;
    private bows: Batch;
    private nocked: Batch;
    private shadows: Batch;
    /** A gun in the bow hand instead of the bow, see `useGun`. */
    private gun: { batch: Batch; scale: number; grip: [number, number, number] } | null = null;
    private local = mat4();
    private world = mat4();

    constructor(private renderer: Renderer, private capacity = 32) {
        const setting = (n: number) => ({ capacity: capacity * n, dynamic: true });
        this.torsos = renderer.batch(torso(), setting(1));
        this.heads = renderer.batch(head(), setting(1));
        this.deadHeads = renderer.batch(head(true), setting(1));
        this.arms = renderer.batch(limb("#ffffff", .07, 1), setting(4));
        this.legs = renderer.batch(limb(TROUSERS, .075), setting(4));
        this.hands = renderer.batch(palm(), setting(2));
        this.feet = renderer.batch(boot(), setting(2));
        this.bows = renderer.batch(bow(), setting(1));
        this.nocked = renderer.batch(arrow(), setting(1));
        this.shadows = renderer.batch(blob(), { ...setting(1), twoSided: true });
    }

    /** Everyone holds this gun instead of a bow: `scale` to metres, `grip` the hand's point in the mesh. */
    useGun(mesh: MeshData, scale: number, grip: [number, number, number]) {
        if (this.gun) this.renderer.removeBatch(this.gun.batch);
        this.gun = { batch: this.renderer.batch(mesh, { capacity: this.capacity, dynamic: true }), scale, grip };
    }

    draw(rigs: { rig: Rig; look: Look }[]) {
        let guns = 0;
        let body = 0, deadHeads = 0, shadows = 0, arms = 0, legs = 0, hands = 0, feet = 0, bows = 0, nocked = 0;
        for (const { rig, look } of rigs)
        {
            const place = rig.place;
            // a soft spot on the ground under the body, none when it's down there itself
            const x = place[12], z = place[14], upright = rig.upright;
            if (upright > .3)
            {
                this.shadows.place(shadows, x, rig.ground(x, z) + .03, z, 0, 0, 0, .8 + .3 * upright);
                this.shadows.tint(shadows++, [1, 1, 1]);
            }
            multiply(this.world, place, rig.torso);
            multiply(this.world, this.world, compose(this.local, 0, 0, 0, 0, 0, 0, 0, 1, rig.heave, 1));
            this.torsos.matrix(body, this.world);
            this.torsos.tint(body, look.clothes);
            const heads = rig.dead ? this.deadHeads : this.heads;
            const index = rig.dead ? deadHeads++ : body - deadHeads;
            heads.matrix(index, multiply(this.world, place, rig.head));
            heads.tint(index, look.skin);
            body++;

            for (const arm of rig.arms)
            {
                for (const bone of [arm.upper, arm.lower])
                {
                    this.arms.matrix(arms, this.stretched(place, bone.worldMatrix, bone.length));
                    this.arms.tint(arms, look.clothes);
                    arms++;
                }
            }
            for (const leg of rig.legs)
            {
                for (const bone of [leg.upper, leg.lower]) this.legs.matrix(legs++, this.stretched(place, bone.worldMatrix, bone.length));
            }
            for (const hand of rig.hands)
            {
                this.hands.matrix(hands, multiply(this.world, place, hand));
                this.hands.tint(hands, look.skin);
                hands++;
            }
            for (const foot of rig.feet) this.feet.matrix(feet++, multiply(this.world, place, foot));

            if (!rig.armed) continue;
            if (this.gun)
            {
                // the rig holds its frame (see `Rig.held`): the grip at the hand
                const { batch, scale, grip } = this.gun;
                multiply(this.world, place, rig.bow);
                compose(this.local, 0, -grip[0] * scale, -grip[1] * scale, -grip[2] * scale, 0, 0, 0, scale);
                batch.matrix(guns, multiply(this.world, this.world, this.local));
                batch.tint(guns++, [1, 1, 1]);
                continue;
            }
            // drawn, the limbs bend back and get a touch shorter
            const draw = rig.draw;
            multiply(this.world, place, rig.bow);
            this.bows.matrix(bows, multiply(this.world, this.world, compose(this.local, 0, 0, 0, 0, 0, 0, 0, 1, 1 - draw * .06, 1 + draw * .9)));
            this.bows.tint(bows, [1, 1, 1]);
            bows++;
            if (draw > .02)
            {
                // the arrow from the string forward
                multiply(this.world, place, rig.bow);
                this.nocked.matrix(nocked, multiply(this.world, this.world, compose(this.local, 0, .018 * rig.side, .012, .1 + .3 * draw - ARROW_LENGTH)));
                this.nocked.tint(nocked, look.clothes);
                nocked++;
            }
        }
        this.torsos.count = body;
        this.heads.count = body - deadHeads;
        this.deadHeads.count = deadHeads;
        this.shadows.count = shadows;
        this.arms.count = arms;
        this.legs.count = legs;
        this.hands.count = hands;
        this.feet.count = feet;
        this.bows.count = bows;
        this.nocked.count = nocked;
        if (this.gun) this.gun.batch.count = guns;
    }

    destroy() {
        for (const batch of [this.torsos, this.heads, this.deadHeads, this.arms, this.legs, this.hands, this.feet, this.bows, this.nocked, this.shadows, ...(this.gun ? [this.gun.batch] : [])]) this.renderer.removeBatch(batch);
    }

    /** A bone's frame in the world, its x stretched to the bone's length. */
    private stretched(place: ArrayLike<number>, bone: ArrayLike<number>, length: number) {
        multiply(this.world, place, bone);
        this.world[0] *= length;
        this.world[1] *= length;
        this.world[2] *= length;
        return this.world;
    }
}

export { MEASURE };
