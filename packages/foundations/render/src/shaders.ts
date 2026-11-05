/** Everything lit: vertex colours, an instance matrix and tint, hemisphere + banded sun, fog, optional sway. */
export const TOON_VERTEX = `#version 300 es
layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in vec4 aColour;
layout(location = 3) in mat4 aModel;
layout(location = 7) in vec4 aTint;

uniform mat4 uViewProjection;
uniform float uTime;
uniform float uSway;

out vec3 vNormal;
out vec3 vColour;
out vec3 vWorld;

void main() {
    vec4 world = aModel * vec4(aPosition, 1.0);
    if (uSway > 0.0)
    {
        // the higher up the model, the more the wind moves it, the ground stays put
        float height = max(aPosition.y, 0.0);
        float phase = uTime * 1.6 + world.x * 0.31 + world.z * 0.23;
        float gust = 0.6 + 0.4 * sin(uTime * 0.37 + world.x * 0.05);
        world.x += sin(phase) * uSway * gust * height * height;
        world.z += cos(phase * 0.8) * uSway * 0.5 * gust * height * height;
    }
    vNormal = mat3(aModel) * aNormal;
    vColour = mix(aColour.rgb, aTint.rgb, aColour.a) * aTint.a;
    vWorld = world.xyz;
    gl_Position = uViewProjection * world;
}`;

export const TOON_FRAGMENT = `#version 300 es
precision highp float;

in vec3 vNormal;
in vec3 vColour;
in vec3 vWorld;

uniform vec3 uCamera;
uniform vec3 uSunDirection;
uniform vec3 uSunColour;
uniform vec3 uSky;
uniform vec3 uGround;
uniform vec3 uFogColour;
uniform float uFogDensity;
uniform float uEmissive;
uniform float uFog;

out vec4 fragColour;

void main() {
    vec3 normal = normalize(vNormal);
    // the back of a two sided face (grass, leaves) faces away sideways, but still gets the light from above
    if (!gl_FrontFacing) normal.xz = -normal.xz;

    // two soft steps of sun over a floor of it, so faces read as light and shade without going dark
    float facing = dot(normal, uSunDirection);
    float sun = 0.35 + smoothstep(0.0, 0.08, facing) * 0.4 + smoothstep(0.4, 0.55, facing) * 0.25;
    // the sky reaches the sides too, only faces turned down get the ground's bounce
    vec3 hemisphere = mix(uGround, uSky, smoothstep(-0.8, 0.4, normal.y));
    vec3 light = hemisphere + uSunColour * sun;
    vec3 colour = vColour * mix(light, vec3(1.0), uEmissive);

    float distance = length(vWorld - uCamera) * uFogDensity;
    float fog = 1.0 - exp(-distance * distance);
    fragColour = vec4(mix(colour, uFogColour, clamp(fog, 0.0, 1.0) * uFog), 1.0);
}`;

/** The sky behind everything: one triangle over the screen, each pixel finds its view direction. */
export const SKY_VERTEX = `#version 300 es
const vec2 corners[3] = vec2[3](vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
uniform mat4 uInverseViewProjection;
out vec3 vDirection;

void main() {
    vec2 corner = corners[gl_VertexID];
    vec4 far = uInverseViewProjection * vec4(corner, 1.0, 1.0);
    vec4 near = uInverseViewProjection * vec4(corner, -1.0, 1.0);
    vDirection = far.xyz / far.w - near.xyz / near.w;
    gl_Position = vec4(corner, 1.0, 1.0);
}`;

export const SKY_FRAGMENT = `#version 300 es
precision highp float;

in vec3 vDirection;

uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uFogColour;
uniform vec3 uSunDirection;
uniform vec3 uDisc;
uniform vec3 uRing;
uniform float uDiscSize;
uniform float uMoon;
uniform float uStars;

out vec4 fragColour;

float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

void main() {
    vec3 direction = normalize(vDirection);
    float up = direction.y;
    vec3 colour = mix(uHorizon, uZenith, pow(clamp(up, 0.0, 1.0), 0.55));
    // the forest hides the horizon, below it fades to the fog
    colour = mix(colour, uFogColour, smoothstep(0.08, -0.05, up));

    // the sun or moon, flat with a crisp ring like cowboy's: where on its face, in disc radii
    vec3 right = normalize(cross(uSunDirection, abs(uSunDirection.y) > 0.99 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0)));
    vec3 above = cross(right, uSunDirection);
    float facing = dot(direction, uSunDirection);
    vec2 face = vec2(dot(direction, right), dot(direction, above)) / uDiscSize;
    float radius = facing > 0.0 ? length(face) : 99.0;
    float edge = fwidth(radius);
    colour = mix(colour, uRing, 1.0 - smoothstep(1.35 - edge, 1.35, radius));
    vec3 disc = uDisc;
    if (uMoon > 0.0)
    {
        // a few round craters in the ring's colour, faint
        float crater = 0.0;
        crater = max(crater, 1.0 - smoothstep(0.3 - edge, 0.3, length(face - vec2(-0.32, 0.2))));
        crater = max(crater, 1.0 - smoothstep(0.42 - edge, 0.42, length(face - vec2(0.28, -0.18))));
        crater = max(crater, 1.0 - smoothstep(0.17 - edge, 0.17, length(face - vec2(-0.2, -0.5))));
        crater = max(crater, 1.0 - smoothstep(0.13 - edge, 0.13, length(face - vec2(0.36, 0.55))));
        disc = mix(disc, vec3(0.8, 0.8, 0.76), crater * 0.8);
    }
    colour = mix(colour, disc, 1.0 - smoothstep(1.0 - edge, 1.0, radius));

    if (uStars > 0.0 && up > 0.0 && radius > 1.4)
    {
        vec3 cell = floor(direction * 180.0);
        float star = step(0.9965, hash(cell));
        colour += vec3(star * uStars * smoothstep(0.0, 0.25, up));
    }

    fragColour = vec4(colour, 1.0);
}`;
