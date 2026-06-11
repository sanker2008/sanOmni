import { promptApi } from "./tauri";

const SANPROMPT_API_URL = "http://localhost:3000/api/sync";
const SYNC_SECRET = "sanprompt_default_secret_2026"; // Hardcoded for MVP, should be in env

export async function publishPromptToWeb(groupId: string) {
  try {
    // 1. 获取本地完整的 Prompt 详情
    const detail = await promptApi.getOne(groupId);
    const { group, images } = detail;

    // 2. 准备 payload
    let template_schema = {};
    if (group.template_schema) {
      try {
        template_schema = JSON.parse(group.template_schema);
      } catch (e) {
        // ignore
      }
    }

    // 假设拿第一张关联图片的 filename 作为封面（实际生产环境需要先上传图床）
    const cover_image_url = images.length > 0 ? `/images/placeholders/${images[0].filename}` : "";

    const payload = {
      id: group.id,
      name: group.name || "Untitled Template",
      description: group.description || "",
      category: "AI Art", // Default category
      price: 4.99, // Default MVP price
      template_schema,
      cover_image_url
    };

    // 3. 发送到 Next.js 后端
    const response = await fetch(SANPROMPT_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SYNC_SECRET}`
      },
      body: JSON.stringify({
        action: "publish_template",
        payload
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "Failed to publish");
    }

    const result = await response.json();
    return result;
  } catch (error: any) {
    console.error("Publish error:", error);
    throw error;
  }
}
