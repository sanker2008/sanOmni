import React, { useState, useEffect } from 'react';
import { type PromptGroup } from '@/stores';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from './ui/dialog';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { Input } from './ui/input';
import { Switch } from './ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { publishPromptToWeb } from '../services/publish';
import { toast } from '@/hooks/useToast';
import { Loader2 } from 'lucide-react';
import { DEFAULT_PROMPT_TEMPLATE_CATEGORY, PROMPT_TEMPLATE_CATEGORIES } from '@/lib/promptTaxonomy';

interface PublishModalProps {
  group: PromptGroup;
  initialStatus?: { price: number; category: string; is_published: boolean };
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function PublishModal({ group, initialStatus, isOpen, onClose, onSuccess }: PublishModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [price, setPrice] = useState(initialStatus?.price?.toString() || group.price?.toString() || "4.99");
  
  const [category, setCategory] = useState(() => {
    const rawCategory = initialStatus?.category || group.category || DEFAULT_PROMPT_TEMPLATE_CATEGORY;
    const isValid = PROMPT_TEMPLATE_CATEGORIES.some(c => c.value === rawCategory);
    return isValid ? rawCategory : DEFAULT_PROMPT_TEMPLATE_CATEGORY;
  });

  const [isPublished, setIsPublished] = useState(initialStatus?.is_published ?? true);

  useEffect(() => {
    if (isOpen) {
      setPrice(initialStatus?.price?.toString() || group.price?.toString() || "4.99");
      
      const rawCategory = initialStatus?.category || group.category || DEFAULT_PROMPT_TEMPLATE_CATEGORY;
      const isValid = PROMPT_TEMPLATE_CATEGORIES.some(c => c.value === rawCategory);
      setCategory(isValid ? rawCategory : DEFAULT_PROMPT_TEMPLATE_CATEGORY);
      
      setIsPublished(initialStatus?.is_published ?? true);
    }
  }, [isOpen, group, initialStatus]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      await publishPromptToWeb(group.id, {
        price: parseFloat(price) || 0,
        category,
        is_published: isPublished
      });

      toast({
        title: "Success",
        description: isPublished ? "Prompt published to store successfully!" : "Saved as draft successfully.",
      });
      onSuccess();
      onClose();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to publish",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Manage Store Listing</DialogTitle>
          <DialogDescription>
            Configure how "{group.name || 'Untitled'}" appears on the sanPrompt store.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 py-4">
          <div className="space-y-2">
            <Label>Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue placeholder="Select a category" />
              </SelectTrigger>
              <SelectContent>
                {PROMPT_TEMPLATE_CATEGORIES.map((cat) => (
                  <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Price (USD)</Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="4.99"
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <Label className="text-base">Published Status</Label>
              <div className="text-sm text-muted-foreground">
                {isPublished ? "Visible on the public store." : "Hidden (Saved as Draft)."}
              </div>
            </div>
            <Switch
              checked={isPublished}
              onCheckedChange={setIsPublished}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save & Sync
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
