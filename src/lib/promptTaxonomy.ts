export const PROMPT_TEMPLATE_CATEGORIES = [
  { value: "Product & Ecommerce", label: "商品与电商" },
  { value: "Marketing & Ads", label: "营销与广告" },
  { value: "Portrait & Personal Brand", label: "人像与个人品牌" },
  { value: "Character & IP", label: "角色与 IP" },
  { value: "Fashion & Beauty", label: "时尚与美妆" },
  { value: "Interior & Architecture", label: "室内与建筑" },
  { value: "UI & Digital Product", label: "UI 与数字产品" },
  { value: "Illustration & Concept Art", label: "插画与概念设计" },
  { value: "Print & Merchandise", label: "印刷与周边" },
  { value: "Cinematic & Storyboard", label: "影视感与分镜" },
] as const;

export const DEFAULT_PROMPT_TEMPLATE_CATEGORY = "Product & Ecommerce";

export function getPromptCategoryLabel(value?: string): string {
  return PROMPT_TEMPLATE_CATEGORIES.find((category) => category.value === value)?.label || value || "未分类";
}
