import { BALLISTICS, clear, Gun, solve, speedOf, Wounds, type Shot, type Vec, type Zone } from "@arrow-warfare/archery";
import type { Difficulty, GameState } from "@arrow-warfare/core";
import type { Pose } from "@arrow-warfare/net";
import { BODY, type Field, type Spawn } from "@arrow-warfare/world";

import { WALK } from "./walker";

/**
 * How each skill plays. `react` seconds from seeing someone to the first shot, `error` radians off the aim
 * (each shot), `draw` seconds to a full pull, `sight` metres they see by day, `lead` how much of the
 * target's walk they allow for, `pause` seconds between shots, `cover` the chance of hiding after one,
 * `think` seconds between decisions, `head` the chance of aiming at the head, `turn` radians a second.
 */
export const SKILL: Record<Difficulty, { react: number; error: number; draw: number; sight: number; lead: number; pause: [number, number]; cover: number; think: number; head: number; turn: number }> = {
    easy: { react: 1.6, error: .07, draw: 1.6, sight: 35, lead: .3, pause: [1.5, 3.2], cover: .15, think: .5, head: 0, turn: 2.2 },
    normal: { react: .9, error: .035, draw: 1.15, sight: 50, lead: .75, pause: [.8, 1.9], cover: .45, think: .32, head: .15, turn: 3.5 },
    hard: { react: .45, error: .016, draw: .85, sight: 70, lead: 1, pause: [.35, 1.1], cover: .75, think: .2, head: .35, turn: 5 },
};

/** Metres a weapon is used from: further away they walk closer first. */
const RANGE = { bow: 45, revolver: 32, rifle: 85 };
/** Seen behind them only this close. */
const NEAR = 8;
/** Bots step this far apart. */
const APART = .9;
/** Picking up reaches this far. */
const REACH = 1.3;
/** Feet to chest and to the face, standing and low (sitting, crawling). */
const CHEST = .62, HEAD = 1.22, LOW_CHEST = .38, LOW_HEAD = .78;

/** Who a bot can fight: everyone standing, players and bots. */
export type Target = { id: string; x: number; y: number; z: number; team: string | null; low: boolean };

/** What bots need from the round, on the host. */
export type BotWorld = {
    field: Field;
    /** Shared ms. */
    now(): number;
    /** Everyone standing now, me and the bots too. */
    targets(): Target[];
    /** Arrows lying where they can be picked up. */
    loose(): { id: string; x: number; y: number; z: number }[];
    /** The fallen with rounds on them. */
    stashes(): { id: string; x: number; z: number }[];
    shoot(shot: Shot): void;
    pick(bot: string, arrow: string): void;
    loot(bot: string, from: string): void;
};

type Mode = "wander" | "hunt" | "fight" | "cover" | "peek" | "fetch";

const random = (a: number, b: number) => a + Math.random() * (b - a);
/** Roughly normal, -1..1 mostly. */
const wobble = () => (Math.random() + Math.random() + Math.random() - 1.5) / .87;
const angle = (a: number) => a - Math.round(a / (Math.PI * 2)) * Math.PI * 2;

/** One bot: a body that walks the field like a player, and what it has in mind. */
class Bot {
    x: number; y: number; z: number;
    yaw: number;
    pitch = 0;
    speed = 0;
    private vx = 0;
    private vz = 0;
    alive = true;
    readonly wounds = new Wounds();
    quiver: number;
    readonly gun: Gun | null;
    /** 0..1 of the pull, or the gun up to the eye. */
    draw = 0;
    private drawing = false;
    private wantPower = 1;
    mode: Mode = "wander";
    private goal: { x: number; z: number } | null = null;
    target: string | null = null;
    /** Who they know is around and where (seen, or shot at them), with when. */
    private known = new Map<string, { x: number; z: number; at: number; since: number }>();
    private visible = false;
    private aimAt: Vec | null = null;
    /** Over the target's feet: the chest or the head, picked each look. */
    private aimHeight = CHEST;
    private aimYaw = 0;
    private aimPitch = 0;
    private thinkIn: number;
    /** Seconds before the first shot: a moment to look round at the start. */
    private pause = random(1.5, 3);
    private shots = 0;
    private progress = { x: 0, z: 0, time: 0 };
    /** Targets' last places, for how fast they walk. */
    private tracks = new Map<string, { x: number; z: number; vx: number; vz: number; at: number }>();

    constructor(readonly id: string, readonly n: number, readonly team: string | null, spawn: Spawn, private field: Field, private rules: GameState["rules"], private skill: typeof SKILL.easy, private sight: number) {
        this.x = spawn.x;
        this.z = spawn.z;
        this.yaw = spawn.yaw;
        this.y = field.floor(spawn.x, spawn.z);
        const weapon = rules.weapon ?? "bow";
        this.gun = weapon === "bow" ? null : new Gun(weapon, rules.ammo);
        this.quiver = rules.arrows > 0 ? rules.arrows : Infinity;
        // staggered: they don't all think on the same frame
        this.thinkIn = Math.random() * skill.think;
        this.aimYaw = this.yaw;
    }

    /** Back at `spawn` with a full quiver (or gun), healed, knowing nothing. */
    revive(spawn: Spawn) {
        this.x = spawn.x;
        this.z = spawn.z;
        this.yaw = this.aimYaw = spawn.yaw;
        this.y = this.field.floor(spawn.x, spawn.z);
        this.vx = this.vz = this.speed = this.pitch = this.draw = 0;
        this.drawing = false;
        this.alive = true;
        this.wounds.heal();
        this.wounds.bits = 0;
        this.quiver = this.rules.arrows > 0 ? this.rules.arrows : Infinity;
        if (this.gun) { this.gun.spare = this.rules.ammo > 0 ? this.rules.ammo : Infinity; this.gun.rounds = this.gun.spec.magazine; }
        this.mode = "wander";
        this.goal = null;
        this.target = null;
        this.known.clear();
        this.tracks.clear();
        this.aimAt = null;
    }

    get low() {
        return this.wounds.posture === "sit";
    }

    get eye(): Vec {
        return [this.x, this.y + (this.low ? .66 : BODY.eye), this.z];
    }

    pose(time: number): Pose {
        return {
            time, x: this.x, y: this.y, z: this.z, yaw: this.yaw, pitch: this.pitch, speed: this.speed,
            draw: this.draw, stage: 0, left: false, wounds: this.wounds.bits, resting: this.wounds.resting,
        };
    }

    /** Shot at by `by` from about `x, z`: they know, and may hide. */
    alarm(by: string, x: number, z: number, now: number) {
        const known = this.known.get(by);
        this.known.set(by, { x, z, at: now, since: known?.since ?? now - this.skill.react * 500 });
        if (!this.target || !this.visible) this.target = by;
        this.thinkIn = Math.min(this.thinkIn, .1);
    }

    hurt(zone: Zone) {
        this.wounds.hurt(zone);
        // a hurt arm drops the pull
        if (zone === "leftArm" || zone === "rightArm") this.draw *= .5;
        if (Math.random() < .5 + this.skill.cover * .5) this.coverSoon = true;
    }

    private coverSoon = false;

    update(dt: number, world: BotWorld, bots: Bot[]) {
        if (!this.alive) return;
        const now = world.now();
        this.wounds.update(dt, this.speed);
        this.thinkIn -= dt;
        if (this.thinkIn <= 0)
        {
            this.thinkIn = this.skill.think * random(.8, 1.2);
            this.think(world, now, bots);
        }
        this.pause = Math.max(0, this.pause - dt);
        this.handle(dt, world, now);
        this.walk(dt, bots);
    }

    // ------------------------------------------------------------------ deciding

    private think(world: BotWorld, now: number, bots: Bot[]) {
        const field = this.field, eye = this.eye;
        const targets = world.targets().filter(other => other.id !== this.id && (!other.team || other.team !== this.team));
        // how fast they go, for the lead
        for (const other of targets)
        {
            const track = this.tracks.get(other.id);
            if (!track) { this.tracks.set(other.id, { x: other.x, z: other.z, vx: 0, vz: 0, at: now }); continue; }
            const span = (now - track.at) / 1000;
            if (span < .05) continue;
            const k = Math.min(1, span * 3);
            track.vx += ((other.x - track.x) / span - track.vx) * k;
            track.vz += ((other.z - track.z) / span - track.vz) * k;
            if (Math.hypot(track.vx, track.vz) > 9) track.vx = track.vz = 0;
            track.x = other.x; track.z = other.z; track.at = now;
        }

        // who's in sight: the nearest few in range, in front of them or close
        const forward = [-Math.sin(this.yaw), -Math.cos(this.yaw)];
        const near = targets.map(other => ({ other, distance: Math.hypot(other.x - this.x, other.z - this.z) }))
            .filter(({ distance }) => distance < this.sight)
            .sort((a, b) => (a.other.id === this.target ? -1 : 0) - (b.other.id === this.target ? -1 : 0) || a.distance - b.distance);
        let seen: Target | null = null;
        for (const { other, distance } of near.slice(0, 3))
        {
            const ahead = ((other.x - this.x) * forward[0] + (other.z - this.z) * forward[1]) / (distance || 1);
            if (distance > NEAR && ahead < -.35 && !this.known.has(other.id)) continue;
            const at: Vec = [other.x, other.y + (other.low ? LOW_HEAD : HEAD), other.z];
            if (!clear(field, eye, at)) continue;
            seen = other;
            break;
        }
        this.visible = !!seen;
        if (seen)
        {
            const known = this.known.get(seen.id);
            this.known.set(seen.id, { x: seen.x, z: seen.z, at: now, since: known && now - known.at < 3000 ? known.since : now });
            this.target = seen.id;
        }
        for (const [id, known] of this.known) if (now - known.at > 20_000 || !targets.some(other => other.id === id)) this.known.delete(id);
        if (this.target && !targets.some(other => other.id === this.target)) this.target = null;

        // out of arrows or rounds: go and get some
        const outOfArrows = !this.gun && this.quiver <= 0;
        const outOfRounds = !!this.gun && this.gun.rounds <= 0 && this.gun.spare <= 0;
        if (outOfArrows || outOfRounds || (!this.gun && Number.isFinite(this.quiver) && this.quiver <= 1 && !seen))
        {
            const found = outOfRounds ? world.stashes() : world.loose();
            let best: { id: string; x: number; z: number } | null = null, distance = 40;
            for (const one of found)
            {
                const d = Math.hypot(one.x - this.x, one.z - this.z);
                if (d < distance) { best = one; distance = d; }
            }
            if (best)
            {
                if (distance < (outOfRounds ? 2 : REACH)) outOfRounds ? world.loot(this.id, best.id) : world.pick(this.id, best.id);
                else return this.go("fetch", best.x, best.z);
            }
            if (outOfArrows || outOfRounds) return this.hide(seen ?? null);
        }

        if (seen)
        {
            const distance = Math.hypot(seen.x - this.x, seen.z - this.z);
            const range = RANGE[this.rules.weapon ?? "bow"] * (.7 + .3 * this.skill.lead);
            this.aimAt = this.aimPoint(seen, distance);
            this.aimHeight = this.aimAt[1] - seen.y;
            if (this.coverSoon && this.mode !== "cover")
            {
                this.coverSoon = false;
                if (this.hide(seen)) return;
            }
            // too far: closer first, drawing on the way
            if (distance > range) return this.go("hunt", seen.x, seen.z);
            if (this.mode === "cover" && this.goal) return;
            this.mode = "fight";
            // hard ones keep moving a little, side to side
            this.goal = Math.random() < this.skill.cover * .3 ? this.beside(seen, random(1.5, 3) * (Math.random() < .5 ? -1 : 1)) : null;
            return;
        }
        this.aimAt = null;
        // in cover with nobody in sight: look round the side
        if (this.mode === "cover" && !this.goal && this.target)
        {
            const known = this.known.get(this.target);
            if (known) return this.go("peek", ...this.besidePoint(known.x, known.z, random(1.6, 2.4) * (Math.random() < .5 ? -1 : 1)));
        }
        // last heard of someone: there, else anywhere
        const last = [...this.known.values()].sort((a, b) => b.at - a.at)[0];
        if (last && (this.mode !== "hunt" || !this.goal)) return this.go("hunt", last.x, last.z);
        if (!this.goal || this.mode !== "wander") this.wander();
    }

    /** Where to aim on `target`: the chest or the head, walked on by the flight time. */
    private aimPoint(target: Target, distance: number): Vec {
        const head = Math.random() < this.skill.head * (distance < 25 ? 1 : .4);
        const y = target.y + (target.low ? (head ? LOW_HEAD : LOW_CHEST) : head ? HEAD : CHEST);
        return [target.x, y, target.z];
    }

    private go(mode: Mode, x: number, z: number) {
        this.mode = mode;
        this.goal = { x, z };
    }

    private wander() {
        this.mode = "wander";
        for (let i = 0; i < 8; i++)
        {
            const a = Math.random() * Math.PI * 2, d = random(8, 25);
            let x = this.x + Math.cos(a) * d, z = this.z + Math.sin(a) * d;
            const r = Math.hypot(x, z), edge = this.field.radius - 3;
            if (r > edge) { x *= edge / r; z *= edge / r; }
            if (!this.field.open(x, z, 1)) continue;
            this.goal = { x, z };
            return;
        }
        this.goal = { x: this.x * .5, z: this.z * .5 };
    }

    /** A point `side` metres to the side of the line to `target`, a step closer. */
    private beside(target: { x: number; z: number }, side: number) {
        const [x, z] = this.besidePoint(target.x, target.z, side);
        return { x, z };
    }

    private besidePoint(tx: number, tz: number, side: number): [number, number] {
        const dx = tx - this.x, dz = tz - this.z, d = Math.hypot(dx, dz) || 1;
        return [this.x - dz / d * side + dx / d * .5, this.z + dx / d * side + dz / d * .5];
    }

    /** Behind the nearest trunk, rock or building from `threat` (or anywhere solid). Whether one was found. */
    private hide(threat: { x: number; z: number } | null) {
        const from = threat ?? this.known.get(this.target ?? "") ?? null;
        let best: { x: number; z: number } | null = null, cost = 14;
        const consider = (cx: number, cz: number, size: number) => {
            const d = Math.hypot(cx - this.x, cz - this.z);
            if (d > cost) return;
            let ax = 0, az = 0;
            if (from)
            {
                const fx = cx - from.x, fz = cz - from.z, f = Math.hypot(fx, fz) || 1;
                // cover between me and them, not past them
                if (Math.hypot(from.x - this.x, from.z - this.z) < f - 2) return;
                ax = fx / f; az = fz / f;
            }
            else { const a = Math.random() * Math.PI * 2; ax = Math.cos(a); az = Math.sin(a); }
            best = { x: cx + ax * (size + .55), z: cz + az * (size + .55) };
            cost = d;
        };
        for (const obstacle of this.field.obstacles) if (!obstacle.soft && obstacle.radius > .2 && obstacle.height > 1) consider(obstacle.x, obstacle.z, obstacle.radius);
        for (const block of this.field.blocks) if (!block.floor && block.top - block.bottom > 1.2) consider(block.x, block.z, Math.max(block.hx, block.hz));
        if (!best) return false;
        this.mode = "cover";
        this.goal = best;
        return true;
    }

    // ------------------------------------------------------------------ the weapon

    private handle(dt: number, world: BotWorld, now: number) {
        const gun = this.gun;
        gun?.update(dt);
        const target = this.target ? world.targets().find(other => other.id === this.target) ?? null : null;
        const known = this.target ? this.known.get(this.target) : undefined;
        const ready = !!target && this.visible && !!known && now - known.since >= this.skill.react * 1000;
        // the aim this frame: the solved shot's way, lead and drop and all
        let solved: ReturnType<typeof solve> = null;
        if (target && this.visible && this.aimAt)
        {
            const eye = this.eye;
            const speed = gun ? BALLISTICS[gun.kind].speed : speedOf(this.wantPower);
            const track = this.tracks.get(target.id);
            const point: Vec = [target.x, target.y + this.aimHeight, target.z];
            solved = solve(eye, point, speed, gun?.kind ?? "arrow");
            if (solved && track)
            {
                const lead = this.skill.lead * solved.time;
                point[0] += track.vx * lead;
                point[2] += track.vz * lead;
                solved = solve(eye, point, speed, gun?.kind ?? "arrow") ?? solved;
            }
            if (!gun)
            {
                const distance = Math.hypot(target.x - this.x, target.z - this.z);
                this.wantPower = distance < 10 ? .65 : distance < 18 ? .85 : 1;
            }
        }
        if (solved)
        {
            this.aimYaw = Math.atan2(-solved.direction[0], -solved.direction[2]);
            this.aimPitch = Math.asin(Math.max(-1, Math.min(1, solved.direction[1])));
        }
        else if (this.speed > .3) this.aimYaw = Math.atan2(-this.vx, -this.vz), this.aimPitch = 0;
        const turn = this.skill.turn * dt * (this.drawing ? .6 : 1);
        const yawOff = angle(this.aimYaw - this.yaw);
        this.yaw = angle(this.yaw + Math.max(-turn, Math.min(turn, yawOff)));
        this.pitch += Math.max(-turn, Math.min(turn, this.aimPitch - this.pitch));
        const onAim = Math.abs(angle(this.aimYaw - this.yaw)) < .03 && Math.abs(this.aimPitch - this.pitch) < .03;
        const engaged = !!target && (this.visible || this.mode === "peek" || this.mode === "cover");

        if (gun)
        {
            if (gun.rounds <= 0 || (!target && gun.rounds < gun.spec.magazine)) gun.reload();
            // the gun up to the eye while there's someone to shoot
            this.draw += ((engaged && this.visible ? 1 : 0) - this.draw) * (1 - Math.exp(-dt * 8));
            if (ready && solved && onAim && this.pause <= 0 && this.draw > .8 && gun.pull() === "shot") this.fire(world, solved.direction, BALLISTICS[gun.kind].speed, gun.kind);
            return;
        }
        // the bow: drawn while someone's about, let go once full and on them
        const canDraw = this.quiver > 0 && this.pause <= 0 && engaged;
        if (!this.drawing && canDraw) this.drawing = true;
        if (this.drawing)
        {
            const rate = this.wounds.drawRate / this.skill.draw;
            this.draw = Math.min(1, this.draw + dt * rate);
            if (!engaged || this.quiver <= 0) this.letDown();
            else if (ready && solved && onAim && this.draw >= this.wantPower) this.fire(world, solved.direction, speedOf(this.draw), "arrow");
        }
        else this.draw = Math.max(0, this.draw - dt * 3);
    }

    private letDown() {
        this.drawing = false;
    }

    private fire(world: BotWorld, direction: Vec, speed: number, kind: Shot["kind"]) {
        // off by the skill, more with a hurt arm, a little less with a gun to the eye
        // walking spoils it, as does a target on the move
        const target = this.target ? this.tracks.get(this.target) : undefined;
        const moving = Math.min(1, this.speed / 2) + Math.min(1, Math.hypot(target?.vx ?? 0, target?.vz ?? 0) / 4) * .5;
        const error = this.skill.error * (1 + moving) + this.wounds.shake * 2;
        const yaw = Math.atan2(-direction[0], -direction[2]) + wobble() * error;
        const pitch = Math.asin(Math.max(-1, Math.min(1, direction[1]))) + wobble() * error;
        const d: Vec = [-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)];
        const eye = this.eye;
        const from: Vec = [eye[0] + d[0] * .3, eye[1] + d[1] * .3, eye[2] + d[2] * .3];
        world.shoot({
            id: `${this.id}:${++this.shots}`, by: this.id, time: world.now(),
            x: from[0], y: from[1], z: from[2], dx: d[0], dy: d[1], dz: d[2], speed, kind: kind === "arrow" ? undefined : kind,
        });
        if (!this.gun) this.quiver--;
        this.drawing = false;
        this.draw = 0;
        this.pause = random(...this.skill.pause) * (this.gun?.kind === "rifle" ? 1.3 : 1);
        if (Math.random() < this.skill.cover) this.coverSoon = true;
    }

    // ------------------------------------------------------------------ walking

    private walk(dt: number, bots: Bot[]) {
        let wantX = 0, wantZ = 0;
        const goal = this.goal;
        if (goal)
        {
            const dx = goal.x - this.x, dz = goal.z - this.z, d = Math.hypot(dx, dz);
            if (d < .5)
            {
                this.goal = null;
                if (this.mode === "peek" || this.mode === "fetch") this.thinkIn = 0;
            }
            else
            {
                // drawn, the bow slows them as it does a player; stopping when it's full and they're on someone
                const holding = this.drawing && this.visible && this.mode === "fight";
                const fast = WALK * this.wounds.walk * (this.drawing || (this.gun && this.draw > .5) ? .45 : 1) * (holding ? 0 : 1);
                const slow = Math.min(1, d / 1.5);
                wantX = dx / d * fast * slow;
                wantZ = dz / d * fast * slow;
            }
        }
        // not on top of each other
        for (const other of bots)
        {
            if (other === this || !other.alive) continue;
            const dx = this.x - other.x, dz = this.z - other.z, d2 = dx * dx + dz * dz;
            if (d2 > APART * APART || d2 < 1e-6) continue;
            const d = Math.sqrt(d2);
            wantX += dx / d * (APART - d) * 4;
            wantZ += dz / d * (APART - d) * 4;
        }
        // slower in a pond
        const wade = this.field.wade(this.x, this.z);
        wantX *= wade;
        wantZ *= wade;
        const grip = 1 - Math.exp(-dt * 10);
        this.vx += (wantX - this.vx) * grip;
        this.vz += (wantZ - this.vz) * grip;
        const fromX = this.x, fromZ = this.z;
        const steps = Math.max(1, Math.ceil(Math.hypot(this.vx, this.vz) * dt / .15));
        for (let i = 0; i < steps; i++) [this.x, this.z] = this.field.collide(this.x + this.vx * dt / steps, this.z + this.vz * dt / steps, BODY.radius, this.y);
        const floor = this.field.floor(this.x, this.z, this.y);
        this.y = this.y > floor + .02 ? Math.max(floor, this.y - 6 * dt) : floor;
        const moved = Math.hypot(this.x - fromX, this.z - fromZ);
        this.speed = dt > 0 ? moved / dt : 0;

        // stuck on something on the way: somewhere else
        this.progress.time += dt;
        if (this.progress.time > 1.5)
        {
            const went = Math.hypot(this.x - this.progress.x, this.z - this.progress.z);
            if (this.goal && went < .4 && Math.hypot(this.vx, this.vz) > .2) this.wander();
            this.progress = { x: this.x, z: this.z, time: 0 };
        }
    }
}

/**
 * The host's bots: played on this phone as if they were players. They walk the field, see who's in sight,
 * aim with lead and drop, hide behind things, and pick arrows up. What they do goes out like a player's.
 */
export class Bots {
    private list: Bot[] = [];
    private byId = new Map<string, Bot>();

    constructor(state: GameState, spawns: Record<string, Spawn>, private world: BotWorld) {
        const skill = SKILL[state.rules.difficulty ?? "normal"] ?? SKILL.normal;
        // they see less far at night and in the rain
        const time = state.rules.time;
        const sight = skill.sight * (time === "night" ? .6 : time === "dawn" || time === "sunset" ? .85 : 1) * (state.rules.rain ? .8 : 1);
        for (const player of state.players)
        {
            if (!player.bot) continue;
            const n = Number(player.id.slice(4));
            if (!Number.isInteger(n) || n < 0 || n > 255) continue;
            const bot = new Bot(player.id, n, player.team, spawns[player.id] ?? { x: 0, z: 0, yaw: 0 }, world.field, state.rules, skill, sight);
            this.list.push(bot);
            this.byId.set(player.id, bot);
        }
    }

    get size() {
        return this.list.length;
    }

    has(id: string) {
        return this.byId.has(id);
    }

    /** The standing ones. */
    get living() {
        return this.list.filter(bot => bot.alive);
    }

    update(dt: number) {
        for (const bot of this.list) bot.update(dt, this.world, this.list);
    }

    /** Where a bot is, for others' rigs and the replay. */
    pose(id: string, time: number) {
        return this.byId.get(id)?.pose(time) ?? null;
    }

    /** A bot was hit by `by`'s shot from `from`: wounded, or (lethal) down. What they leave behind when they die. */
    hit(id: string, zone: Zone, by: string, from: Vec, lethal: boolean) {
        const bot = this.byId.get(id);
        if (!bot || !bot.alive) return null;
        if (lethal)
        {
            bot.alive = false;
            bot.draw = 0;
            return { x: bot.x, y: bot.y, z: bot.z, arrows: bot.gun ? 0 : Number.isFinite(bot.quiver) ? bot.quiver : -1, rounds: bot.gun && Number.isFinite(bot.gun.spare) ? bot.gun.total : 0 };
        }
        bot.hurt(zone);
        if (by !== id) bot.alarm(by, from[0], from[2], this.world.now());
        return null;
    }

    /** Back in the round at `spawn`. */
    revive(id: string, spawn: Spawn) {
        this.byId.get(id)?.revive(spawn);
    }

    /** A player takes this one over: no longer played here. What it had, for the player. */
    release(id: string) {
        const bot = this.byId.get(id);
        if (!bot || !bot.alive) return null;
        this.byId.delete(id);
        this.list = this.list.filter(other => other !== bot);
        return { x: bot.x, z: bot.z, yaw: bot.yaw, arrows: bot.gun ? 0 : bot.quiver, rounds: bot.gun ? bot.gun.rounds : 0, spare: bot.gun ? bot.gun.spare : 0, wounds: bot.wounds.bits };
    }

    /** A shot went by near the bots: the ones it passed near know about the shooter. */
    heard(by: string, from: Vec, at: Vec) {
        for (const bot of this.list)
        {
            if (!bot.alive || bot.id === by) continue;
            if (Math.hypot(bot.x - at[0], bot.z - at[2]) < 6) bot.alarm(by, from[0], from[2], this.world.now());
        }
    }

    /** The host gave a bot an arrow, or rounds. */
    picked(id: string) {
        const bot = this.byId.get(id);
        if (bot && Number.isFinite(bot.quiver)) bot.quiver++;
    }

    looted(id: string, rounds: number) {
        const gun = this.byId.get(id)?.gun;
        if (!gun) return;
        gun.spare = (Number.isFinite(gun.spare) ? gun.spare : 0) + rounds;
        if (gun.rounds <= 0) gun.reload();
    }

    /** For the packet: each standing bot's number, pose and place. */
    each(fn: (bot: { id: string; n: number; x: number; z: number; alive: boolean }) => void) {
        for (const bot of this.list) fn(bot);
    }
}
