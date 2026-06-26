import { Excalidraw } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import { useEffect, useState, useRef } from "react";

export default function ThoughtCanvas() {
  const [initialData, setInitialData] = useState<any>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const timeoutRef = useRef<any>(null);

  useEffect(() => {
    const savedData = localStorage.getItem("san-labs-thought-canvas");
    if (savedData) {
      try {
        setInitialData({ elements: JSON.parse(savedData) });
      } catch (e) {
        console.error(e);
      }
    }
    setIsLoaded(true);
  }, []);

  const handleChange = (elements: readonly any[]) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      localStorage.setItem("san-labs-thought-canvas", JSON.stringify(elements));
    }, 1000);
  };

  if (!isLoaded) return null;

  return (
    <div className="w-full h-full relative">
      <Excalidraw
        initialData={initialData}
        onChange={handleChange}
      />
    </div>
  );
}
