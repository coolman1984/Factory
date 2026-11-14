// Route ribbon on the floor: UV.x = metres along the path. Travelled part glows, the part ahead shows moving chevrons,
// and a bright head marks the trolley's position (progress, in metres, set from the engine timeline).
shader_type spatial;
render_mode unshaded, cull_disabled, depth_draw_never, blend_mix, shadows_disabled;

uniform vec4 col : source_color = vec4(1.0, 0.62, 0.12, 1.0);
uniform float progress = 0.0;

void fragment() {
	float s = UV.x;
	float across = abs(UV.y - 0.5) * 2.0;
	float edge = smoothstep(1.0, 0.55, across);
	float rim = smoothstep(0.55, 0.95, across) * smoothstep(1.0, 0.92, across);
	float done = 1.0 - smoothstep(progress - 0.05, progress + 0.05, s);
	float chev = smoothstep(0.45, 0.55, fract(s * 0.7 - TIME * 0.9 - across * 0.25)) * (1.0 - smoothstep(0.75, 0.85, fract(s * 0.7 - TIME * 0.9 - across * 0.25)));
	float ahead = (1.0 - done) * (0.10 + 0.22 * chev) * edge;
	float head = exp(-abs(s - progress) * 0.9);
	float lit = done * (0.55 * edge + 0.9 * rim) + head * 1.4 * edge;
	ALBEDO = mix(col.rgb, vec3(1.0), head * 0.45);
	ALPHA = clamp(lit + ahead, 0.0, 1.0);
}
