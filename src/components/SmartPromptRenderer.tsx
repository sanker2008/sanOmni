import { useState, useMemo, useEffect } from "react";
import { Copy, Dices } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/useToast";

interface Option {
  label: string;
  value: string;
}

interface Variable {
  key: string;
  label: string;
  type: "combobox" | "select" | "input";
  allow_custom?: boolean;
  required?: boolean;
  default?: string;
  options?: Option[];
}

interface TemplateSchema {
  raw_prompt?: string;
  variables?: Variable[];
  [key: string]: any;
}

interface SmartPromptRendererProps {
  templateSchemaStr: string;
  basePrompt: string;
}

export function SmartPromptRenderer({ templateSchemaStr, basePrompt }: SmartPromptRendererProps) {
  const [schema, setSchema] = useState<TemplateSchema | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});

  useEffect(() => {
    try {
      if (templateSchemaStr.trim()) {
        const parsed = JSON.parse(templateSchemaStr);
        if (parsed && Array.isArray(parsed.variables)) {
          setSchema(parsed);
          
          // Initialize default values
          const initialValues: Record<string, string> = {};
          parsed.variables.forEach((v: Variable) => {
            if (v.default !== undefined) {
              initialValues[v.key] = v.default;
            } else if (v.options && v.options.length > 0) {
              // Fallback to first option if no default is provided
              initialValues[v.key] = v.options[0].value;
            } else {
              initialValues[v.key] = "";
            }
          });
          setValues(initialValues);
          return;
        }
      }
    } catch (e) {
      // JSON is invalid
    }
    setSchema(null);
  }, [templateSchemaStr]);

  const rawPromptText = schema?.raw_prompt || basePrompt;

  const assembledPrompt = useMemo(() => {
    if (!schema || !schema.variables) return rawPromptText;
    
    let result = rawPromptText;
    schema.variables.forEach((v) => {
      const val = values[v.key] || "";
      // Replace all occurrences of {{key}}
      const regex = new RegExp(`\\{\\{${v.key}\\}\\}`, "g");
      result = result.replace(regex, val);
    });
    return result;
  }, [schema, values, rawPromptText]);

  const handleCopyText = async (text: string, fieldName: string) => {
    if (!text.trim()) return;
    try {
      await navigator.clipboard.writeText(text.trim());
      toast({ title: `✓ 已复制${fieldName}` });
    } catch (error) {
      toast({ title: `✗ 复制${fieldName}失败`, variant: "destructive" });
    }
  };

  if (!schema || !schema.variables || schema.variables.length === 0) {
    // If not a valid template, just render the base prompt
    return (
      <div>
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">提示词：</span>
          <Button 
            variant="ghost" size="sm" className="h-7 px-2 text-xs" 
            onClick={() => void handleCopyText(basePrompt, "提示词")}
          >
            <Copy className="mr-1 h-3 w-3" /> 复制
          </Button>
        </div>
        <p className="mt-1 text-sm text-muted-foreground whitespace-pre-wrap bg-muted/40 p-2.5 rounded border">
          {basePrompt}
        </p>
      </div>
    );
  }

  const handleValueChange = (key: string, newValue: string) => {
    setValues(prev => ({ ...prev, [key]: newValue }));
  };

  const handleRandomize = () => {
    if (!schema || !schema.variables) return;
    const newValues = { ...values };
    schema.variables.forEach(v => {
      if (v.options && v.options.length > 0) {
        const randomIdx = Math.floor(Math.random() * v.options.length);
        newValues[v.key] = v.options[randomIdx].value;
      }
    });
    setValues(newValues);
  };

  return (
    <div className="space-y-6">
      {/* 智能表单区域 */}
      <div className="rounded-md border p-4 bg-card shadow-sm space-y-4">
        <h3 className="text-sm font-semibold flex items-center justify-between border-b pb-2">
          <span>🪄 智能填词面板</span>
          <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={handleRandomize}>
            <Dices className="mr-1 h-3.5 w-3.5" /> 随机组合
          </Button>
        </h3>
        <div className="grid gap-4 md:grid-cols-2">
          {schema.variables.map(v => (
            <div key={v.key} className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                {v.label} <span className="opacity-50">({v.key})</span>
              </label>
              
              {v.type === "input" ? (
                <Input 
                  value={values[v.key] || ""} 
                  onChange={(e) => handleValueChange(v.key, e.target.value)}
                  className="h-8 text-sm"
                  placeholder={v.default || "请输入..."}
                />
              ) : (
                <div className="flex flex-col gap-2">
                  <div className="flex flex-wrap gap-1.5">
                    {(v.options || []).map((opt, idx) => {
                      const isSelected = values[v.key] === opt.value;
                      return (
                        <Badge 
                          key={idx}
                          variant={isSelected ? "default" : "outline"}
                          className="cursor-pointer transition-colors text-xs font-normal"
                          onClick={() => handleValueChange(v.key, opt.value)}
                        >
                          {opt.label}
                        </Badge>
                      );
                    })}
                  </div>
                  {(v.type === "combobox" || v.allow_custom) && (
                    <Input 
                      value={values[v.key] || ""} 
                      onChange={(e) => handleValueChange(v.key, e.target.value)}
                      className="h-8 text-sm mt-1"
                      placeholder="自定义输入..."
                    />
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* 组装后的结果 */}
      <div>
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-primary">实时组装 Prompt：</span>
          <Button 
            variant="default" size="sm" className="h-7 px-3 text-xs" 
            onClick={() => void handleCopyText(assembledPrompt, "组装结果")}
          >
            <Copy className="mr-1 h-3 w-3" /> 一键复制
          </Button>
        </div>
        <div className="mt-1.5 relative group">
          <p className="text-sm text-foreground whitespace-pre-wrap bg-primary/5 p-3 rounded-md border border-primary/20 leading-relaxed font-mono selection:bg-primary/20">
            {assembledPrompt}
          </p>
        </div>
      </div>

      {/* 原始模板 */}
      <div>
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">原始模板 (Template)：</span>
          <Button 
            variant="ghost" size="sm" className="h-6 px-2 text-[10px]" 
            onClick={() => void handleCopyText(rawPromptText, "原始模板")}
          >
            <Copy className="mr-1 h-2.5 w-2.5" /> 复制模板
          </Button>
        </div>
        <p className="mt-1 text-xs text-muted-foreground whitespace-pre-wrap bg-muted/40 p-2.5 rounded border opacity-70">
          {rawPromptText}
        </p>
      </div>
    </div>
  );
}
