import sys
import pillow_matting
import perfect_matting

def main():
    if len(sys.argv) < 4:
        print("Usage: pro_bg_engine <strategy: A|B> <input_path> <output_path>")
        sys.exit(1)
        
    strategy = sys.argv[1]
    input_path = sys.argv[2]
    output_path = sys.argv[3]
    
    if strategy == 'A':
        pillow_matting.remove_white_bg(input_path, output_path)
    elif strategy == 'B':
        perfect_matting.process_image(input_path, output_path)
    else:
        print(f"Unknown strategy: {strategy}")
        sys.exit(1)

if __name__ == "__main__":
    # 多进程支持(针对某些库如 PyTorch, onnx 在 Windows 下的需要)
    try:
        import multiprocessing
        multiprocessing.freeze_support()
    except Exception:
        pass

    main()
