/** Where a player is and looks, sent 20 times a second on the lossy channel. */
export type Pose = {
    /** Shared ms it was taken at. */
    time: number;
    x: number;
    y: number;
    z: number;
    yaw: number;
    pitch: number;
    /** Metres per second over the ground, for the walk. */
    speed: number;
    /** 0..1, how far the bow is drawn. */
    draw: number;
    /** 0 fresh, 1 swaying, 2 tunnel vision, 3 panting. */
    stage: number;
    /** Left handed: the bow in the right hand. */
    left: boolean;
    /** Wound bits (arms and legs), with injuries on. */
    wounds: number;
    /** Sat down to rest, out of energy. */
    resting: boolean;
};

export const POSE_RATE = 20;

/** Type byte first, so other fast messages can share the channel later. */
const POSE = 1;
const BYTES = 1 + 8 + 4 * 6 + 3;

/** 36 bytes: a type byte, the time as a double, the rest as floats, then a byte each for the draw, the stage and hand, the wounds and resting. */
export function packPose(pose: Pose) {
    const view = new DataView(new ArrayBuffer(BYTES));
    view.setUint8(0, POSE);
    view.setFloat64(1, pose.time);
    view.setFloat32(9, pose.x);
    view.setFloat32(13, pose.y);
    view.setFloat32(17, pose.z);
    view.setFloat32(21, pose.yaw);
    view.setFloat32(25, pose.pitch);
    view.setFloat32(29, pose.speed);
    view.setUint8(33, Math.round(Math.max(0, Math.min(1, pose.draw)) * 255));
    view.setUint8(34, (pose.stage & 3) | (pose.left ? 4 : 0));
    view.setUint8(35, (pose.wounds & 15) | (pose.resting ? 16 : 0));
    return view.buffer;
}

/** Null for anything that isn't a whole, sane pose. */
export function unpackPose(data: ArrayBuffer): Pose | null {
    if (data.byteLength !== BYTES) return null;
    const view = new DataView(data);
    if (view.getUint8(0) !== POSE) return null;
    const pose = {
        time: view.getFloat64(1),
        x: view.getFloat32(9),
        y: view.getFloat32(13),
        z: view.getFloat32(17),
        yaw: view.getFloat32(21),
        pitch: view.getFloat32(25),
        speed: view.getFloat32(29),
        draw: view.getUint8(33) / 255,
        stage: view.getUint8(34) & 3,
    };
    const flags = view.getUint8(35);
    return Object.values(pose).every(Number.isFinite) ? { ...pose, left: (view.getUint8(34) & 4) !== 0, wounds: flags & 15, resting: (flags & 16) !== 0 } : null;
}

/** The host's bots, many to a packet: `bot-<n>` and their poses, all taken at one time. */
const BOTS = 2;
const BOT_BYTES = 15;
/** Bots in one packet, so it stays under a datagram (about 1 kB). */
export const BOTS_PER_PACKET = 64;

/**
 * `1 + 8 + 1` bytes then 15 a bot: its number, x y z in cm, yaw and pitch as shorts, the speed in
 * twentieths of m/s, then a byte each for the draw, stage, hand and resting, and the wounds.
 */
export function packBots(time: number, bots: { n: number; pose: Pose }[]) {
    const count = Math.min(bots.length, BOTS_PER_PACKET);
    const view = new DataView(new ArrayBuffer(10 + count * BOT_BYTES));
    view.setUint8(0, BOTS);
    view.setFloat64(1, time);
    view.setUint8(9, count);
    const short = (x: number) => Math.max(-32767, Math.min(32767, Math.round(x)));
    for (let i = 0; i < count; i++)
    {
        const { n, pose } = bots[i], at = 10 + i * BOT_BYTES;
        const yaw = pose.yaw - Math.round(pose.yaw / (Math.PI * 2)) * Math.PI * 2;
        view.setUint8(at, n);
        view.setInt16(at + 1, short(pose.x * 100));
        view.setInt16(at + 3, short(pose.y * 100));
        view.setInt16(at + 5, short(pose.z * 100));
        view.setInt16(at + 7, short(yaw / Math.PI * 32767));
        view.setInt16(at + 9, short(pose.pitch / (Math.PI / 2) * 32767));
        view.setUint8(at + 11, Math.round(Math.max(0, Math.min(12.75, pose.speed)) * 20));
        view.setUint8(at + 12, Math.round(Math.max(0, Math.min(1, pose.draw)) * 255));
        view.setUint8(at + 13, (pose.stage & 3) | (pose.left ? 4 : 0) | (pose.resting ? 8 : 0));
        view.setUint8(at + 14, pose.wounds & 15);
    }
    return view.buffer;
}

/** Null for anything that isn't a whole bots packet. */
export function unpackBots(data: ArrayBuffer): { time: number; bots: { n: number; pose: Pose }[] } | null {
    if (data.byteLength < 10) return null;
    const view = new DataView(data);
    if (view.getUint8(0) !== BOTS) return null;
    const time = view.getFloat64(1), count = view.getUint8(9);
    if (!Number.isFinite(time) || data.byteLength !== 10 + count * BOT_BYTES) return null;
    const bots: { n: number; pose: Pose }[] = [];
    for (let i = 0; i < count; i++)
    {
        const at = 10 + i * BOT_BYTES, flags = view.getUint8(at + 13);
        bots.push({
            n: view.getUint8(at),
            pose: {
                time,
                x: view.getInt16(at + 1) / 100, y: view.getInt16(at + 3) / 100, z: view.getInt16(at + 5) / 100,
                yaw: view.getInt16(at + 7) / 32767 * Math.PI, pitch: view.getInt16(at + 9) / 32767 * Math.PI / 2,
                speed: view.getUint8(at + 11) / 20, draw: view.getUint8(at + 12) / 255,
                stage: flags & 3, left: (flags & 4) !== 0, resting: (flags & 8) !== 0, wounds: view.getUint8(at + 14) & 15,
            },
        });
    }
    return { time, bots };
}
