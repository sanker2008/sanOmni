import { useEffect, useCallback } from "react";
import { useImageStore, useIpImageStore, useUIStore } from "@/stores";

export function useKeyboardShortcuts() {
  const {
    activeTab,
    setActiveTab,
    isQuickEditOpen,
    closeQuickEdit,
    settingsOpen,
    closeSettings,
    openSettings,
    setSearchQuery,
  } = useUIStore();
  const { selectedImages, clearSelection } = useImageStore();
  const { selectedImages: ipSelectedImages, clearSelection: clearIpSelection } = useIpImageStore();

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInputFocused =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable;

      // Ctrl+A: Select all images in current view (only when not in input)
      if (e.ctrlKey && e.key === "a" && !isInputFocused) {
        e.preventDefault();
        const { activeTab, promptTab, ipTab } = useUIStore.getState();
        if (activeTab === "prompt") {
            const { inboxImages: promptInbox, archivedImages: promptArchived, selectAll: selectPromptAll } = useImageStore.getState();
            selectPromptAll((promptTab === "archived" ? promptArchived : promptInbox).map(img => img.id));
        } else {
            const { inboxImages: ipInbox, archivedImages: ipArchived, selectAll: selectIpAll } = useIpImageStore.getState();
            selectIpAll((ipTab === "archived" ? ipArchived : ipInbox).map(img => img.id));
        }
        return;
      }

      // Escape: Cancel selection / Close modals
      if (e.key === "Escape") {
        if (settingsOpen) {
          closeSettings();
          return;
        }
        if (isQuickEditOpen) {
          closeQuickEdit();
          return;
        }
        if (selectedImages.length > 0 || ipSelectedImages.length > 0) {
          clearSelection();
          clearIpSelection();
          return;
        }
        return;
      }

      const hasSelection = selectedImages.length > 0 || ipSelectedImages.length > 0;
      const allSelectedIds = activeTab === "prompt" ? selectedImages : ipSelectedImages;

      // Delete/Backspace: Delete selected images (only confirmation)
      if (
        (e.key === "Delete" || e.key === "Backspace") &&
        !isInputFocused &&
        hasSelection
      ) {
        e.preventDefault();
        window.dispatchEvent(
          new CustomEvent("keyboard-delete-selected", {
            detail: { imageIds: allSelectedIds },
          })
        );
        return;
      }

      // Ctrl+Enter: Archive selected images
      if (e.ctrlKey && e.key === "Enter" && hasSelection) {
        e.preventDefault();
        window.dispatchEvent(
          new CustomEvent("keyboard-archive-selected", {
            detail: { imageIds: allSelectedIds },
          })
        );
        return;
      }

      // 1/2: Switch prompt/ip tab (only when not in input)
      if (!isInputFocused && !e.ctrlKey && !e.altKey && !e.metaKey) {
        if (e.key === "1") {
          setActiveTab("prompt");
          return;
        }
        if (e.key === "2") {
          setActiveTab("ip");
          return;
        }
      }

      // Ctrl+F: Focus search input
      if (e.ctrlKey && e.key === "f") {
        e.preventDefault();
        const searchInput = document.querySelector<HTMLInputElement>(
          'input[placeholder*="搜索"]'
        );
        if (searchInput) {
          searchInput.focus();
        } else {
          // Fallback: set search query to trigger focus
          setSearchQuery("");
          setTimeout(() => {
            const input = document.querySelector<HTMLInputElement>(
              'input[placeholder*="搜索"]'
            );
            if (input) input.focus();
          }, 0);
        }
        return;
      }

      // Ctrl+,: Open settings
      if (e.ctrlKey && e.key === ",") {
        e.preventDefault();
        if (settingsOpen) {
          closeSettings();
        } else {
          openSettings();
        }
        return;
      }
    },
    [
      activeTab,
      setActiveTab,
      isQuickEditOpen,
      closeQuickEdit,
      settingsOpen,
      closeSettings,
      openSettings,
      setSearchQuery,
      selectedImages,
      clearSelection,
      ipSelectedImages,
      clearIpSelection,
    ]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);
}
