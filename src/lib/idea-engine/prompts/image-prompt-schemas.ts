import 'server-only';

export const RICH_IMAGE_PROMPT_INSTRUCTION = `RICH image_prompt schema (LinkedIn, Instagram, Facebook):
{
  "objective": { "primary_intent": "", "content_idea_supported": "", "platform_context": "", "scroll_trigger": "", "success_criteria": "" },
  "concept": { "core_metaphor": "", "storybeat": "", "symbolism_notes": "", "originality_constraint": "" },
  "subject_and_scene": { "subject": "", "environment": "", "time_of_day": "", "era_or_setting": "", "scene_description": "" },
  "composition_and_camera": { "framing": "", "camera_angle": "", "lens_or_focal_style": "", "depth_of_field": "", "layout_geometry": "", "focal_point": "", "foreground_midground_background": "" },
  "visual_elements": { "key_objects": [], "supporting_objects": [], "materials_and_textures": [], "motion_or_energy": "", "ui_or_graphics": { "included": false, "description": "", "readability_rules": "" } },
  "style": { "style_and_medium": "", "reference_class": "", "level_of_realism": "", "render_quality": "", "brand_fit_notes": "" },
  "colour_and_lighting": { "palette": "", "contrast_level": "", "lighting_setup": "", "light_direction": "", "highlight_focus": "", "colour_avoid": "" },
  "typography": { "include_text": false, "text_content": "", "font_style": "", "placement": "", "legibility_rules": "" },
  "platform_output": { "aspect_ratio": "", "safe_margins_px": "", "crop_risk_notes": "" },
  "negative_prompt": { "hard_exclusions": [], "soft_avoidances": [], "cliche_blacklist": [] }
}`;

export const SIMPLE_IMAGE_PROMPT_INSTRUCTION = `SIMPLE image_prompt schema (X, Blog):
{
  "intent": "",
  "scene": "",
  "composition": "",
  "style": "",
  "lighting": "",
  "avoid": ""
}`;

export function imagePromptInstructionForChannel(channel: string): string {
	const ch = channel.toLowerCase();
	if (ch === 'linkedin' || ch === 'instagram' || ch === 'facebook') {
		return RICH_IMAGE_PROMPT_INSTRUCTION;
	}
	return SIMPLE_IMAGE_PROMPT_INSTRUCTION;
}
