{
  "template_id": "agent_tpl_001",
  "name": "多功能图像生成助手",
  "version": "1.0",
  "description": "允许用户通过下拉或手动输入，快速生成高质量的场景图像。",
  "engine": "midjourney", 
  "raw_prompt": "A highly detailed {{style}} painting of a {{subject}} in {{location}}, during {{time_of_day}}, {{lighting_effect}}, 8k resolution, trending on artstation, {{aspect_ratio}}",
  "variables": [
    {
      "key": "style",
      "label": "艺术风格",
      "type": "combobox",
      "allow_custom": true,
      "required": true,
      "default": "cyberpunk",
      "options": [
        {"label": "赛博朋克 (Cyberpunk)", "value": "cyberpunk"},
        {"label": "水彩画 (Watercolor)", "value": "watercolor"},
        {"label": "极简主义 (Minimalist)", "value": "minimalist"}
      ]
    },
    {
      "key": "subject",
      "label": "画面主体",
      "type": "input",
      "allow_custom": true,
      "required": true,
      "default": "mechanical tiger",
      "options": [] 
    },
    {
      "key": "location",
      "label": "发生地点",
      "type": "combobox",
      "allow_custom": true,
      "required": true,
      "default": "neon city streets",
      "options": [
        {"label": "霓虹都市 (Neon city streets)", "value": "neon city streets"},
        {"label": "废弃神庙 (Abandoned temple)", "value": "abandoned temple"}
      ]
    },
    {
      "key": "time_of_day",
      "label": "时间段",
      "type": "combobox",
      "allow_custom": true,
      "required": false,
      "default": "midnight",
      "options": [
        {"label": "午夜 (Midnight)", "value": "midnight"},
        {"label": "黄金时刻 (Golden hour)", "value": "golden hour"}
      ]
    },
    {
      "key": "lighting_effect",
      "label": "光影效果",
      "type": "combobox",
      "allow_custom": true,
      "required": false,
      "default": "cinematic lighting",
      "options": [
        {"label": "电影光 (Cinematic lighting)", "value": "cinematic lighting"},
        {"label": "丁达尔效应 (Tyndall effect)", "value": "Tyndall effect"}
      ]
    },
    {
      "key": "aspect_ratio",
      "label": "画面比例",
      "type": "select",
      "allow_custom": false,
      "required": true,
      "default": "--ar 16:9",
      "options": [
        {"label": "横屏 16:9", "value": "--ar 16:9"},
        {"label": "竖屏 9:16", "value": "--ar 9:16"}
      ]
    }
  ]
}