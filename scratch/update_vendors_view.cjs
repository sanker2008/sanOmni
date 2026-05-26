const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/components/VendorsView.tsx');
let content = fs.readFileSync(filePath, 'utf8');
content = content.replace(/\r\n/g, '\n');

// 1. Add Dialog imports
content = content.replace(
  'import { toast } from "@/hooks/useToast";',
  'import { toast } from "@/hooks/useToast";\nimport { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";'
);

// 2. Add state for delete dialog
content = content.replace(
  '  const [addingModelForVendor, setAddingModelForVendor] = useState<string | null>(null);',
  '  const [addingModelForVendor, setAddingModelForVendor] = useState<string | null>(null);\n  const [modelToDelete, setModelToDelete] = useState<{id: string, name: string} | null>(null);\n  const [modelUsageCount, setModelUsageCount] = useState<number>(0);\n  const [isDeleting, setIsDeleting] = useState(false);'
);

// 3. Replace the delete button onClick
const oldDeleteBtnStr = `                                              onClick={async () => {
                                                if (confirm(\`确定要删除模型 "\${model.name}" 吗？\`)) {
                                                  try {
                                                    const { vendorApi } = await import("@/services/tauri");
                                                    await vendorApi.deleteModel(model.id);
                                                    const updatedVendors = await vendorApi.getAll();
                                                    setVendors(updatedVendors);
                                                  } catch (error) {
                                                    toast({
                                                      title: "✗ 删除失败",
                                                      description: String(error),
                                                      variant: "destructive",
                                                    });
                                                  }
                                                }
                                              }}`;

const newDeleteBtnStr = `                                              onClick={async () => {
                                                try {
                                                  const { vendorApi } = await import("@/services/tauri");
                                                  const count = await vendorApi.checkModelUsage(model.id);
                                                  if (count === 0) {
                                                    if (confirm(\`确定要删除模型 "\${model.name}" 吗？\`)) {
                                                      await vendorApi.deleteModelCascade(model.id, "none");
                                                      const updatedVendors = await vendorApi.getAll();
                                                      setVendors(updatedVendors);
                                                    }
                                                  } else {
                                                    setModelToDelete({ id: model.id, name: model.name });
                                                    setModelUsageCount(count);
                                                  }
                                                } catch (error) {
                                                  toast({
                                                    title: "✗ 检查失败",
                                                    description: String(error),
                                                    variant: "destructive",
                                                  });
                                                }
                                              }}`;

content = content.replace(oldDeleteBtnStr, newDeleteBtnStr);

// 4. Add the Dialog to the end of the return statement
const dialogStr = `
      <Dialog open={!!modelToDelete} onOpenChange={(open) => !open && setModelToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>删除模型确认</DialogTitle>
            <DialogDescription className="space-y-2 pt-4 text-base">
              模型 <span className="font-semibold text-foreground">{modelToDelete?.name}</span> 目前被 <span className="font-semibold text-destructive">{modelUsageCount}</span> 张图片关联。
              <br/><br/>
              为了保证数据一致性，请选择对这些关联图片的处理方式：
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col sm:flex-col gap-2 mt-4">
            <Button
              variant="destructive"
              className="w-full sm:w-full"
              disabled={isDeleting}
              onClick={async () => {
                if (!modelToDelete) return;
                setIsDeleting(true);
                try {
                  const { vendorApi } = await import("@/services/tauri");
                  await vendorApi.deleteModelCascade(modelToDelete.id, "delete_images");
                  const updatedVendors = await vendorApi.getAll();
                  setVendors(updatedVendors);
                  setModelToDelete(null);
                  toast({ title: "✓ 删除成功", description: "已删除模型及所有关联图片" });
                } catch (error) {
                  toast({ title: "✗ 删除失败", description: String(error), variant: "destructive" });
                } finally {
                  setIsDeleting(false);
                }
              }}
            >
              删除模型及关联图片（高危操作：会彻底删除图片文件）
            </Button>
            <Button
              variant="secondary"
              className="w-full sm:w-full"
              disabled={isDeleting}
              onClick={async () => {
                if (!modelToDelete) return;
                setIsDeleting(true);
                try {
                  const { vendorApi } = await import("@/services/tauri");
                  await vendorApi.deleteModelCascade(modelToDelete.id, "move_to_unknown");
                  const updatedVendors = await vendorApi.getAll();
                  setVendors(updatedVendors);
                  setModelToDelete(null);
                  toast({ title: "✓ 删除成功", description: "图片已迁移至其他模型或 Unknown" });
                } catch (error) {
                  toast({ title: "✗ 删除失败", description: String(error), variant: "destructive" });
                } finally {
                  setIsDeleting(false);
                }
              }}
            >
              仅删除模型，图片移至其他模型/Unknown（推荐）
            </Button>
            <Button
              variant="outline"
              className="w-full sm:w-full mt-2"
              disabled={isDeleting}
              onClick={() => setModelToDelete(null)}
            >
              取消
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
`;

content = content.replace('    </div>\n  );\n}\n', dialogStr + '    </div>\n  );\n}\n');

fs.writeFileSync(filePath, content, 'utf8');
console.log("Successfully updated VendorsView.tsx");
