import { MeshBuilder, seeded, type MeshData, type Vec3 } from "@arrow-warfare/render";

/**
 * Every model of the meadow, low poly and made in code, in metres with the ground at y 0. Parts with
 * `tint: 1` take the instance's colour: flower petals, and the player's clothes and skin.
 */

const BARK = "#7a5536";
const BARK_DARK = "#5e3f28";

/** A round leafy tree, a trunk and a few lumpy balls. */
export function roundTree(seed: number): MeshData {
    const random = seeded(seed);
    const height = 1.8 + random() * .8;
    const leaves = ["#4f8f3a", "#5a9c3c", "#47843a"][seed % 3];
    const tree = new MeshBuilder().cylinder(BARK, { scale: [.32, height + .4, .32] }, 6, .5, .32, false, .2, seed);
    tree.ball(leaves, { at: [0, height + .9, 0], scale: [1.5, 1.3, 1.5] }, 1, .3, seed);
    for (let i = 0; i < 2; i++)
    {
        const angle = random() * Math.PI * 2;
        tree.ball(leaves, { at: [Math.cos(angle) * .9, height + .4 + random() * .6, Math.sin(angle) * .9], scale: .8 + random() * .3 }, 1, .3, seed + i + 1);
    }
    return tree.build();
}

/** A fir, stacked cones. */
export function pineTree(seed: number): MeshData {
    const random = seeded(seed);
    const needles = ["#2f6b3a", "#356f3c", "#2b6236"][seed % 3];
    const tree = new MeshBuilder().cylinder(BARK_DARK, { scale: [.25, 1.2, .25] }, 5, .5, .4, false);
    let y = .7, radius = 1.4;
    for (let i = 0; i < 3; i++)
    {
        tree.cylinder(needles, { at: [0, y, 0], yaw: random(), scale: [radius * 2, 1.7, radius * 2] }, 7, .5, 0, true, .15, seed + i);
        y += 1;
        radius *= .72;
    }
    return tree.build();
}

/** A birch, a thin white trunk with marks and a light crown. */
export function birchTree(seed: number): MeshData {
    const random = seeded(seed);
    const height = 2.6 + random() * .6;
    const tree = new MeshBuilder().cylinder("#ece6da", { scale: [.2, height, .2] }, 6, .5, .4, false);
    for (let i = 0; i < 4; i++) tree.box("#3b3530", { at: [0, .5 + i * .6 + random() * .2, 0], yaw: random() * 3, scale: [.21, .05, .12] });
    tree.ball("#8dbb4c", { at: [0, height + .5, 0], scale: [1, 1.4, 1] }, 1, .3, seed);
    tree.ball("#7fb046", { at: [.5, height - .1, .2], scale: .6 }, 1, .3, seed + 3);
    return tree.build();
}

export const TREE_KINDS = [roundTree, pineTree, birchTree];

/** A few blades, swayed by the renderer. */
export function grassTuft(seed: number): MeshData {
    const random = seeded(seed);
    const tuft = new MeshBuilder();
    const blades = 4 + Math.floor(random() * 3);
    for (let i = 0; i < blades; i++)
    {
        const angle = random() * Math.PI * 2;
        tuft.blade("#3f7a2c", random() > .5 ? "#a8d36a" : "#93c45a", {
            at: [Math.cos(angle) * .08, 0, Math.sin(angle) * .08],
            yaw: random() * Math.PI * 2,
            roll: (random() - .5) * .5,
        }, .07, .35 + random() * .3);
    }
    return tuft.build();
}

/** A flower on a stem, its petals take the instance's tint. */
export function flower(): MeshData {
    return new MeshBuilder()
        .blade("#4a8a32", "#4a8a32", {}, .03, .34)
        .blade("#4a8a32", "#4a8a32", { yaw: Math.PI / 2 }, .03, .34)
        .ball("#ffffff", { at: [0, .36, 0], scale: [.09, .04, .09], tint: 1 }, 0)
        .ball("#ffd94a", { at: [0, .385, 0], scale: .035 }, 0)
        .build();
}

/** A fly agaric, a white stem and a red cap with white dots. */
export function mushroom(): MeshData {
    const dots = (point: Vec3) => (Math.abs(Math.sin(point[0] * 9) * Math.cos(point[2] * 9)) > .55 && point[1] > .2 ? "#f6f0e2" : "#d63b30");
    return new MeshBuilder()
        .cylinder("#f2ead8", { scale: [.12, .2, .12] }, 6, .5, .4)
        .ball(dots, { at: [0, .2, 0], scale: [.17, .1, .17] }, 1)
        .build();
}

export function stone(seed: number): MeshData {
    const random = seeded(seed);
    const grey = ["#9a9a92", "#8c8d88", "#a5a39a"][seed % 3];
    return new MeshBuilder().ball(grey, { at: [0, .1, 0], scale: [.4 + random() * .2, .28, .35 + random() * .2] }, 0, .35, seed).build();
}

/** A fallen trunk, 3 m long along x. */
export function log(): MeshData {
    return new MeshBuilder()
        .cylinder(BARK, { at: [-1.5, .32, 0], roll: -Math.PI / 2, scale: [.64, 3, .64] }, 7, .5, .46, false, .1, 4)
        .cylinder("#c9a26b", { at: [-1.5, .32, 0], roll: -Math.PI / 2, scale: [.6, .02, .6] }, 7)
        .cylinder("#c9a26b", { at: [1.5, .32, 0], roll: Math.PI / 2, scale: [.58, .02, .58] }, 7)
        .build();
}

export function stump(): MeshData {
    return new MeshBuilder()
        .cylinder(BARK, { scale: [.8, .45, .8] }, 7, .5, .42, false, .15, 9)
        .cylinder("#c9a26b", { at: [0, .45, 0], scale: [.68, .01, .68] }, 7)
        .build();
}

/** Player measures, the silly ones: big torso, tiny legs. */
export const BODY = {
    /** From the feet to the eyes. */
    eye: 1.26,
    /** Collision radius. */
    radius: .35,
    height: 1.46,
};

/**
 * A stand-in player until the rig: tiny dark legs and a big torso and arms in the clothes colour (tint).
 * Faces -z. The head is `head()`, its own batch because the skin is another tint.
 */
export function body(): MeshData {
    return new MeshBuilder()
        .cylinder("#3b3a4a", { at: [-.13, 0, 0], scale: [.16, .3, .16] }, 5)
        .cylinder("#3b3a4a", { at: [.13, 0, 0], scale: [.16, .3, .16] }, 5)
        .box("#2c2a25", { at: [-.13, .04, -.05], scale: [.18, .08, .26] })
        .box("#2c2a25", { at: [.13, .04, -.05], scale: [.18, .08, .26] })
        .cylinder("#ffffff", { at: [0, .26, 0], scale: [.62, .72, .5], tint: 1 }, 8, .5, .42)
        .box("#5a3a22", { at: [0, .5, 0], scale: [.6, .07, .46] })
        .cylinder("#ffffff", { at: [-.36, .88, 0], roll: 2.6, scale: [.14, .5, .14], tint: 1 }, 5, .5, .4)
        .cylinder("#ffffff", { at: [.36, .88, 0], roll: -2.6, scale: [.14, .5, .14], tint: 1 }, 5, .5, .4)
        .build();
}

/** The round head, skin from the tint, eyes and a nose looking along -z. Centred at the neck. */
export function head(): MeshData {
    return new MeshBuilder()
        .ball("#ffffff", { at: [0, .22, 0], scale: .24, tint: 1 }, 1)
        .ball("#ffffff", { at: [0, .2, -.24], scale: [.06, .05, .06], tint: 1 }, 0)
        .ball("#1b1b22", { at: [-.08, .28, -.21], scale: .035 }, 0)
        .ball("#1b1b22", { at: [.08, .28, -.21], scale: .035 }, 0)
        .cylinder("#6b4a2e", { at: [0, .38, 0], scale: [.36, .1, .36] }, 7, .5, .3)
        .build();
}

/** Where the head sits on the body. */
export const NECK = 1.0;

/** The bow's half length, grip to tip, and how far its tips bend back towards the archer at rest. */
export const BOW = { half: .6, tip: .1 };
/** An arrow's length, tip to nock. */
export const ARROW_LENGTH = .78;

/**
 * A short wooden bow standing on y, the grip at 0, the limbs curving back towards +z (the archer). Drawn,
 * it's scaled along z so the curve deepens. The string is its own mesh, `beam()`.
 */
export function bow(): MeshData {
    const builder = new MeshBuilder();
    const steps = 8;
    const point = (i: number): Vec3 => {
        const y = (i / steps * 2 - 1) * BOW.half;
        return [0, y, BOW.tip * (y / BOW.half) ** 2];
    };
    for (let i = 0; i < steps; i++)
    {
        const [, y0, z0] = point(i), [, y1, z1] = point(i + 1);
        const length = Math.hypot(y1 - y0, z1 - z0);
        const thick = .03 - Math.abs((y0 + y1) / 2) / BOW.half * .012;
        builder.box(i % 2 ? "#8a5a2b" : "#94622f", { at: [0, (y0 + y1) / 2, (z0 + z1) / 2], pitch: Math.atan2(z1 - z0, y1 - y0), scale: [thick, length + .01, thick * .8] });
    }
    builder.box("#4a2e1a", { scale: [.045, .15, .045] });
    builder.box("#e8e0cc", { at: [0, BOW.half, BOW.tip], scale: .025 });
    builder.box("#e8e0cc", { at: [0, -BOW.half, BOW.tip], scale: .025 });
    return builder.build();
}

/** A thin rod from 0 to -1 on z, stretched into place: the bow string, forearms. Takes the tint. */
export function beam(sides = 4): MeshData {
    return new MeshBuilder().cylinder("#ffffff", { pitch: -Math.PI / 2, scale: [1, 1, 1], tint: 1 }, sides, .5, .5).build();
}

/**
 * An arrow, the tip at 0 pointing along -z and the shaft back along +z. The feathers take the tint: the
 * shooter's colour.
 */
export function arrow(): MeshData {
    const length = ARROW_LENGTH;
    const builder = new MeshBuilder()
        .cylinder("#c9a26b", { at: [0, 0, length], pitch: -Math.PI / 2, scale: [.016, length - .06, .016] }, 4)
        .cylinder("#7d7d84", { at: [0, 0, .07], pitch: -Math.PI / 2, scale: [.045, .08, .045] }, 4, .5, 0);
    for (let i = 0; i < 3; i++)
    {
        const roll = i / 3 * Math.PI * 2;
        builder.box("#ffffff", { at: [Math.sin(roll) * .025, Math.cos(roll) * .025, length - .07], roll: -roll, scale: [.003, .035, .1], tint: 1 });
    }
    return builder.build();
}

/** A round hand, the skin from the tint. */
export function hand(): MeshData {
    return new MeshBuilder().ball("#ffffff", { scale: [.045, .05, .055], tint: 1 }, 1).build();
}

/** A soft darker grass spot on the grass under a tree or a player, 1 m across. Shadows on the cheap. */
export function blob(): MeshData {
    const builder = new MeshBuilder();
    const sides = 12;
    const inner: Vec3 = [.36, .54, .22], outer: Vec3 = [.41, .6, .25];
    for (let i = 0; i < sides; i++)
    {
        const a = (i / sides) * Math.PI * 2, b = ((i + 1) / sides) * Math.PI * 2;
        const near = (angle: number, r: number): Vec3 => [Math.cos(angle) * r, 0, -Math.sin(angle) * r];
        builder.triangle([0, 0, 0], near(a, .3), near(b, .3), inner);
        builder.quad(near(a, .3), near(a, .5), near(b, .5), near(b, .3), outer);
    }
    return builder.build();
}
