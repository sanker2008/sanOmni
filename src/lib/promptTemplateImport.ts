import { PROMPT_TEMPLATE_CATEGORIES } from "@/lib/promptTaxonomy";

/**
 * 可移植 Prompt 模板文件格式。
 *
 * 这个格式刻意保留了数据库中独立存储的基础字段和 Template JSON：导入时会
 * 校验两处内容完全一致，防止 Agent 只生成了其中一半数据而造成显示与实际
 * 渲染结果不一致。
 */
export const PROMPT_TEMPLATE_IMPORT_FORMAT = "sanOmni.prompt-template";
export const PROMPT_TEMPLATE_IMPORT_VERSION = 1;

export type PromptTemplateVariableType = "combobox" | "select" | "input";

export interface PromptTemplateVariableOption {
  label: string;
  value: string;
}

export interface PromptTemplateVariable {
  key: string;
  label: string;
  type: PromptTemplateVariableType;
  allow_custom: boolean;
  required: boolean;
  default: string;
  options: PromptTemplateVariableOption[];
}

export interface PromptTemplateSchema {
  name: string;
  description: string;
  raw_prompt: string;
  negative_prompt: string;
  variables: PromptTemplateVariable[];
}

export interface PromptTemplateImport {
  format: typeof PROMPT_TEMPLATE_IMPORT_FORMAT;
  version: typeof PROMPT_TEMPLATE_IMPORT_VERSION;
  template: {
    name: string;
    description: string;
    category: string;
    tags: string[];
    price: number;
    prompt: string;
    negative_prompt: string;
    template_schema: PromptTemplateSchema;
  };
}

export interface ImportedPromptTemplateFormData {
  prompt: string;
  negative_prompt: string;
  name: string;
  description: string;
  template_schema: string;
  category: string;
  tags: string;
  price: string;
}

export class PromptTemplateImportError extends Error {
  constructor(public readonly issues: string[]) {
    super(issues.join("；"));
    this.name = "PromptTemplateImportError";
  }
}

const ALLOWED_CATEGORIES = new Set(PROMPT_TEMPLATE_CATEGORIES.map((category) => category.value));
const VARIABLE_TYPES = new Set<PromptTemplateVariableType>(["combobox", "select", "input"]);
const VARIABLE_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(record: Record<string, unknown>, key: string, issues: string[]): string {
  const value = record[key];
  if (typeof value !== "string") {
    issues.push(`缺少字符串字段 template.${key}`);
    return "";
  }
  if (!value.trim()) {
    issues.push(`template.${key} 不能为空`);
  }
  return value.trim();
}

function requiredStringAllowEmpty(record: Record<string, unknown>, key: string, issues: string[], path = `template.${key}`): string {
  const value = record[key];
  if (typeof value !== "string") {
    issues.push(`缺少字符串字段 ${path}`);
    return "";
  }
  return value.trim();
}

function validateVariables(value: unknown, issues: string[]): PromptTemplateVariable[] {
  if (!Array.isArray(value)) {
    issues.push("template.template_schema.variables 必须是数组（静态模板请传 []）");
    return [];
  }

  const keys = new Set<string>();
  return value.flatMap((entry, index) => {
    const path = `template.template_schema.variables[${index}]`;
    if (!isRecord(entry)) {
      issues.push(`${path} 必须是对象`);
      return [];
    }

    const key = requiredStringAllowEmpty(entry, "key", issues, `${path}.key`);
    const label = requiredStringAllowEmpty(entry, "label", issues, `${path}.label`);
    const type = entry.type;
    const allowCustom = entry.allow_custom;
    const required = entry.required;
    const defaultValue = requiredStringAllowEmpty(entry, "default", issues, `${path}.default`);
    const optionsValue = entry.options;

    if (!VARIABLE_KEY_PATTERN.test(key)) {
      issues.push(`${path}.key 只能使用字母、数字和下划线，且不能以数字开头`);
    } else if (keys.has(key)) {
      issues.push(`${path}.key 与前面的变量重复：${key}`);
    } else {
      keys.add(key);
    }
    if (!label) issues.push(`${path}.label 不能为空`);
    if (typeof type !== "string" || !VARIABLE_TYPES.has(type as PromptTemplateVariableType)) {
      issues.push(`${path}.type 必须是 combobox、select 或 input`);
    }
    if (typeof allowCustom !== "boolean") issues.push(`${path}.allow_custom 必须是布尔值`);
    if (typeof required !== "boolean") issues.push(`${path}.required 必须是布尔值`);
    if (!Array.isArray(optionsValue)) {
      issues.push(`${path}.options 必须是数组`);
    }

    const options = Array.isArray(optionsValue)
      ? optionsValue.flatMap((option, optionIndex) => {
          const optionPath = `${path}.options[${optionIndex}]`;
          if (!isRecord(option)) {
            issues.push(`${optionPath} 必须是对象`);
            return [];
          }
          const optionLabel = requiredStringAllowEmpty(option, "label", issues, `${optionPath}.label`);
          const optionValue = requiredStringAllowEmpty(option, "value", issues, `${optionPath}.value`);
          if (!optionLabel) issues.push(`${optionPath}.label 不能为空`);
          if (!optionValue) issues.push(`${optionPath}.value 不能为空`);
          return [{ label: optionLabel, value: optionValue }];
        })
      : [];

    return [{
      key,
      label,
      type: VARIABLE_TYPES.has(type as PromptTemplateVariableType) ? type as PromptTemplateVariableType : "input",
      allow_custom: Boolean(allowCustom),
      required: Boolean(required),
      default: defaultValue,
      options,
    }];
  });
}

/** 解析并严格校验 Agent 生成的模板文件，不会静默补默认值。 */
export function parsePromptTemplateImport(source: string): PromptTemplateImport {
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    throw new PromptTemplateImportError(["文件不是有效的 JSON"]);
  }

  const issues: string[] = [];
  if (!isRecord(value)) {
    throw new PromptTemplateImportError(["导入文件最外层必须是 JSON 对象"]);
  }
  if (value.format !== PROMPT_TEMPLATE_IMPORT_FORMAT) {
    issues.push(`format 必须为 ${PROMPT_TEMPLATE_IMPORT_FORMAT}`);
  }
  if (value.version !== PROMPT_TEMPLATE_IMPORT_VERSION) {
    issues.push(`version 必须为 ${PROMPT_TEMPLATE_IMPORT_VERSION}`);
  }
  if (!isRecord(value.template)) {
    issues.push("缺少对象字段 template");
    throw new PromptTemplateImportError(issues);
  }

  const template = value.template;
  const name = requiredString(template, "name", issues);
  const description = requiredString(template, "description", issues);
  const category = requiredString(template, "category", issues);
  const prompt = requiredString(template, "prompt", issues);
  const negativePrompt = requiredStringAllowEmpty(template, "negative_prompt", issues);
  const price = template.price;
  const tags = template.tags;

  if (!ALLOWED_CATEGORIES.has(category as typeof PROMPT_TEMPLATE_CATEGORIES[number]["value"])) {
    issues.push("template.category 不是 sanOmni 支持的分类");
  }
  if (typeof price !== "number" || !Number.isFinite(price) || price < 0) {
    issues.push("template.price 必须是大于等于 0 的数字");
  }
  if (!Array.isArray(tags)) {
    issues.push("template.tags 必须是字符串数组");
  } else {
    const seenTags = new Set<string>();
    tags.forEach((tag, index) => {
      if (typeof tag !== "string" || !tag.trim()) {
        issues.push(`template.tags[${index}] 必须是非空字符串`);
      } else if (seenTags.has(tag.trim())) {
        issues.push(`template.tags 中存在重复标签：${tag.trim()}`);
      } else {
        seenTags.add(tag.trim());
      }
    });
  }

  if (!isRecord(template.template_schema)) {
    issues.push("template.template_schema 必须是对象");
    throw new PromptTemplateImportError(issues);
  }

  const schemaValue = template.template_schema;
  const schemaName = requiredString(schemaValue, "name", issues);
  const schemaDescription = requiredString(schemaValue, "description", issues);
  const schemaPrompt = requiredString(schemaValue, "raw_prompt", issues);
  const schemaNegativePrompt = requiredStringAllowEmpty(schemaValue, "negative_prompt", issues, "template.template_schema.negative_prompt");
  const variables = validateVariables(schemaValue.variables, issues);

  if (schemaName !== name) issues.push("template_schema.name 必须与 template.name 完全一致");
  if (schemaDescription !== description) issues.push("template_schema.description 必须与 template.description 完全一致");
  if (schemaPrompt !== prompt) issues.push("template_schema.raw_prompt 必须与 template.prompt 完全一致");
  if (schemaNegativePrompt !== negativePrompt) issues.push("template_schema.negative_prompt 必须与 template.negative_prompt 完全一致");

  const placeholders = new Set(
    Array.from(prompt.matchAll(/\{\{([^{}]+)\}\}/g), (match) => match[1]),
  );
  const variableKeys = new Set(variables.map((variable) => variable.key));
  variableKeys.forEach((key) => {
    if (!placeholders.has(key)) issues.push(`变量 ${key} 没有在 template.prompt 中使用 {{${key}}}`);
  });
  placeholders.forEach((key) => {
    if (!variableKeys.has(key)) issues.push(`template.prompt 使用了未定义的变量 {{${key}}}`);
  });

  if (issues.length > 0) throw new PromptTemplateImportError(issues);

  return {
    format: PROMPT_TEMPLATE_IMPORT_FORMAT,
    version: PROMPT_TEMPLATE_IMPORT_VERSION,
    template: {
      name,
      description,
      category,
      tags: (tags as string[]).map((tag) => tag.trim()),
      price: price as number,
      prompt,
      negative_prompt: negativePrompt,
      template_schema: {
        name: schemaName,
        description: schemaDescription,
        raw_prompt: schemaPrompt,
        negative_prompt: schemaNegativePrompt,
        variables,
      },
    },
  };
}

export function promptTemplateImportToFormData(value: PromptTemplateImport): ImportedPromptTemplateFormData {
  return {
    prompt: value.template.prompt,
    negative_prompt: value.template.negative_prompt,
    name: value.template.name,
    description: value.template.description,
    template_schema: JSON.stringify(value.template.template_schema, null, 2),
    category: value.template.category,
    tags: value.template.tags.join(", "),
    price: value.template.price.toString(),
  };
}

export function getPromptTemplateImportExample(): PromptTemplateImport {
  const prompt = "为 {{product_name}} 创作一张商业产品海报，使用 {{background_color}} 背景，柔和棚拍光线，画面干净、高级、适合电商主图。";
  const negativePrompt = "低清晰度，水印，文字错误，畸形物体，杂乱背景";
  const name = "玻璃器皿电商海报";
  const description = "用于生成干净、高级的玻璃器皿商品主图；可替换产品名称与背景色。";

  return {
    format: PROMPT_TEMPLATE_IMPORT_FORMAT,
    version: PROMPT_TEMPLATE_IMPORT_VERSION,
    template: {
      name,
      description,
      category: "Product & Ecommerce",
      tags: ["电商", "产品摄影", "玻璃器皿"],
      price: 4.99,
      prompt,
      negative_prompt: negativePrompt,
      template_schema: {
        name,
        description,
        raw_prompt: prompt,
        negative_prompt: negativePrompt,
        variables: [
          {
            key: "product_name",
            label: "产品名称",
            type: "input",
            allow_custom: true,
            required: true,
            default: "香水瓶",
            options: [],
          },
          {
            key: "background_color",
            label: "背景颜色",
            type: "select",
            allow_custom: false,
            required: true,
            default: "奶油白",
            options: [
              { label: "奶油白", value: "奶油白" },
              { label: "雾霾蓝", value: "雾霾蓝" },
              { label: "高级灰", value: "高级灰" },
            ],
          },
        ],
      },
    },
  };
}
