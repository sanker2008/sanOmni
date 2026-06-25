import sys
import os

# Force UTF-8 and replace invalid bytes to prevent Tauri shell crash
os.environ["PYTHONIOENCODING"] = "utf-8:replace"
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
sys.stderr.reconfigure(encoding='utf-8', errors='replace')

# Suppress noisy C-level logs from ONNX Runtime that might bypass Python's encoding
os.environ["ONNXRUNTIME_SUPPRESS_WARNINGS"] = "1"
os.environ["ORT_LOGGING_LEVEL"] = "4"
import argparse
import cv2
import numpy as np
import io
import gc
from rembg import remove, new_session
from PIL import Image

def smoothstep(x, edge0, edge1):
    """Hermite interpolation between edge0 and edge1."""
    x = np.clip((x - edge0) / (edge1 - edge0), 0.0, 1.0)
    return x * x * (3.0 - 2.0 * x)

def guided_filter_gray(I_gray, p_alpha, r, eps):
    """
    Guided filter for alpha refinement.
    
    Parameters:
        I_gray (ndarray): Grayscale guide image, float32 [0,1].
        p_alpha (ndarray): Initial alpha map, float32 [0,1].
        r (int): Filter radius. Larger = smoother edges but may lose fine detail.
        eps (float): Regularization. Smaller = sharper edges, larger = smoother.
    """
    mean_I = cv2.boxFilter(I_gray, cv2.CV_32F, (r, r))
    mean_p = cv2.boxFilter(p_alpha, cv2.CV_32F, (r, r))
    mean_Ip = cv2.boxFilter(I_gray * p_alpha, cv2.CV_32F, (r, r))
    cov_Ip = mean_Ip - mean_I * mean_p
    
    mean_II = cv2.boxFilter(I_gray * I_gray, cv2.CV_32F, (r, r))
    var_I = mean_II - mean_I * mean_I
    
    a = cov_Ip / (var_I + eps)
    b = mean_p - a * mean_I
    
    mean_a = cv2.boxFilter(a, cv2.CV_32F, (r, r))
    mean_b = cv2.boxFilter(b, cv2.CV_32F, (r, r))
    
    return mean_a * I_gray + mean_b

def process_image(input_path, output_path, guided_radius=15, guided_eps=1e-4,
                  bg_threshold=150.0, bg_feathering=80.0, decontam_erode=15):
    """
    IS-Net + Guided Filter based background removal with edge decontamination.

    Parameters:
        input_path (str): Path to input image.
        output_path (str): Path to save output PNG.
        guided_radius (int): Guided filter radius. Larger = smoother edges. Default: 15. Range: 3-60.
        guided_eps (float): Guided filter epsilon. Smaller = sharper. Default: 1e-4. Range: 1e-6 to 0.1.
        bg_threshold (float): Luminance threshold for background detection. Default: 150. Range: 50-250.
            Lower values = more aggressive halo removal (good for dark backgrounds).
            Higher values = more conservative (preserves more edge detail).
        bg_feathering (float): Width of the background feathering transition. Default: 80. Range: 20-200.
            Smaller = harder cut. Larger = softer, more gradual fade.
        decontam_erode (int): Erosion kernel size for decontamination mask. Default: 15. Range: 3-30.
            Controls how far inward from edges the color cleanup extends.
    """
    print(f"Processing: {input_path}")
    print(f"Parameters: guided_radius={guided_radius}, guided_eps={guided_eps}, "
          f"bg_threshold={bg_threshold}, bg_feathering={bg_feathering}, decontam_erode={decontam_erode}")

    # Use PIL to read the image to support WebP/AVIF and avoid OpenCV's OutOfMemory bugs with certain formats
    # and to perfectly handle non-ASCII file paths on Windows.
    orig_pil = Image.open(input_path).convert('RGB')
    orig = cv2.cvtColor(np.array(orig_pil), cv2.COLOR_RGB2BGR)
    orig_float = orig.astype(np.float32)
    
    session = new_session("isnet-general-use")
    with open(input_path, 'rb') as f:
        rembg_out = remove(f.read(), session=session)
    rembg_img = Image.open(io.BytesIO(rembg_out))
    raw_alpha = np.array(rembg_img.split()[3])
    
    del session
    del rembg_out
    del rembg_img
    gc.collect()

    print("Refining Alpha Map with Guided Filter...")
    # 1. Refine Edge (Photoshop-level Guided Filter Matting)
    I_gray = cv2.cvtColor(orig, cv2.COLOR_BGR2GRAY).astype(np.float32) / 255.0
    p_alpha = raw_alpha.astype(np.float32) / 255.0
    refined_alpha_f = guided_filter_gray(I_gray, p_alpha, r=guided_radius, eps=guided_eps)
    refined_alpha_f = np.clip(refined_alpha_f, 0.0, 1.0)
    
    print("Applying Dual-Layer Synthesis and Edge Protection...")
    # 2. Dual-Layer Alpha Synthesis with Silky Tips Preservation
    core_alpha_f = smoothstep(refined_alpha_f, 120.0/255.0, 180.0/255.0)
    
    # Use a luminance penalty to gracefully fade out the background halo.
    b_ch, g_ch, r_ch = cv2.split(orig_float)
    luminance = 0.299 * r_ch + 0.587 * g_ch + 0.114 * b_ch
    
    # bg_threshold and bg_feathering control the halo detection sensitivity
    bg_likeness = np.clip((luminance - bg_threshold) / bg_feathering, 0.0, 1.0)
    # Only penalize pixels in the semi-transparent fringe
    fringe_likeness = np.clip((255.0 - raw_alpha) / 100.0, 0.0, 1.0)
    penalty = bg_likeness * fringe_likeness
    
    # Apply penalty to smoothly erase the halo without clipping the dark hair tips!
    edge_alpha_f = refined_alpha_f * (1.0 - penalty)
    
    final_alpha_f = np.maximum(core_alpha_f, edge_alpha_f)
    final_alpha = (final_alpha_f * 255.0).astype(np.uint8)
    final_alpha = cv2.GaussianBlur(final_alpha, (3, 3), 0)
    
    print("Performing Spatial Ambient Decontamination...")
    # 3. Spatial Ambient Decontamination
    core_mask = cv2.erode(raw_alpha, np.ones((decontam_erode, decontam_erode), np.uint8))
    core_float = (core_mask > 128).astype(np.float32)
    core_rgb = orig_float * np.expand_dims(core_float, axis=2)
    
    blur_large = 61
    blurred_rgb = cv2.GaussianBlur(core_rgb, (blur_large, blur_large), 0)
    blurred_mask = cv2.GaussianBlur(core_float, (blur_large, blur_large), 0)
    blurred_mask[blurred_mask < 0.001] = 1.0
    ambient_rgb = np.clip(blurred_rgb / np.expand_dims(blurred_mask, axis=2), 0, 255)
    
    safe_core = cv2.erode(raw_alpha, np.ones((5, 5), np.uint8))
    fringe_weight = 1.0 - (safe_core.astype(np.float32) / 255.0)
    fringe_weight = cv2.GaussianBlur(fringe_weight, (5, 5), 0)
    
    fringe_weight_rgb = np.expand_dims(fringe_weight, axis=2)
    final_rgb = ambient_rgb * fringe_weight_rgb + orig_float * (1.0 - fringe_weight_rgb)
    final_rgb_u8 = np.clip(final_rgb, 0, 255).astype(np.uint8)
    
    print(f"Saving optimized cutout to: {output_path}")
    b, g, r = cv2.split(final_rgb_u8)
    cv2.imwrite(output_path, cv2.merge([b, g, r, final_alpha]))
    print("Done!")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="IS-Net + Guided Filter professional background removal")
    parser.add_argument("input", help="Input image path")
    parser.add_argument("output", help="Output image path")
    parser.add_argument("--guided_radius", type=int, default=15,
                        help="Guided filter radius (3-60, default: 15). Larger = smoother edges")
    parser.add_argument("--guided_eps", type=float, default=1e-4,
                        help="Guided filter epsilon (1e-6 to 0.1, default: 1e-4). Smaller = sharper")
    parser.add_argument("--bg_threshold", type=float, default=150.0,
                        help="Background luminance threshold (50-250, default: 150). Lower = more aggressive halo removal")
    parser.add_argument("--bg_feathering", type=float, default=80.0,
                        help="Background feathering range (20-200, default: 80). Smaller = harder edge cut")
    parser.add_argument("--decontam_erode", type=int, default=15,
                        help="Decontamination erosion kernel size (3-30, default: 15)")

    args = parser.parse_args()
    process_image(args.input, args.output,
                  guided_radius=args.guided_radius,
                  guided_eps=args.guided_eps,
                  bg_threshold=args.bg_threshold,
                  bg_feathering=args.bg_feathering,
                  decontam_erode=args.decontam_erode)
