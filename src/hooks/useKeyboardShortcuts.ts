import { useEffect, useCallback } from "react";
import { useImageStore, useUIStore } from "@/stores";

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
  const { selectedImages, selectAll, clearSelection } = useImageStore();

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
        selectAll();
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
        if (selectedImages.length > 0) {
          clearSelection();
          return;
        }
        return;
      }

      // Delete/Backspace: Delete selected images (only confirmation)
      if (
        (e.key === "Delete" || e.key === "Backspace") &&
        !isInputFocused &&
        selectedImages.length > 0
      ) {
        // Only prevent default if there are selected images
        e.preventDefault();
        // Trigger a custom event that the delete confirmation dialog can listen to
        window.dispatchEvent(
          new CustomEvent("keyboard-delete-selected", {
            detail: { imageIds: selectedImages },
          })
        );
        return;
      }

      // Ctrl+Enter: Archive selected images
      if (e.ctrlKey && e.key === "Enter" && selectedImages.length > 0) {
        e.preventDefault();
        window.dispatchEvent(
          new CustomEvent("keyboard-archive-selected", {
            detail: { imageIds: selectedImages },
          })
        );
        return;
      }

      // 1/2: Switch inbox/archived tab (only when not in input)
      if (!isInputFocused && !e.ctrlKey && !e.altKey && !e.metaKey) {
        if (e.key === "1") {
          setActiveTab("inbox");
          return;
        }
        if (e.key === "2") {
          setActiveTab("archived");
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
      selectAll,
      clearSelection,
    ]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);
}
