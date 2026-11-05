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
};

export const POSE_RATE = 20;

/** Type byte first, so other fast messages can share the channel later. */
const POSE = 1;
const BYTES = 1 + 8 + 4 * 6 + 2;

/** 35 bytes: a type byte, the time as a double, the rest as floats, the draw and stage as a byte each. */
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
    return Object.values(pose).every(Number.isFinite) ? { ...pose, left: (view.getUint8(34) & 4) !== 0 } : null;
}
