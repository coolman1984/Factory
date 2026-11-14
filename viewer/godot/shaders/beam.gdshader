// Soft vertical light beam over a stop: strongest at the floor, fading upward, gently breathing.
shader_type spatial;
render_mode unshaded, cull_disabled, depth_draw_never, blend_add, shadows_disabled;

uniform vec4 col : source_color = vec4(1.0, 0.7, 0.2, 1.0);
uniform float strength = 0.35;
varying float h;

void vertex() { h = VERTEX.y / 5.0 + 0.5; }

void fragment() {
	float fresnel = pow(1.0 - abs(dot(NORMAL, VIEW)), 1.5);
	float fade = pow(1.0 - clamp(h, 0.0, 1.0), 2.2);
	ALBEDO = col.rgb;
	ALPHA = clamp(fade * strength * (0.3 + 0.7 * fresnel) * (0.85 + 0.15 * sin(TIME * 1.8)), 0.0, 1.0);
}
