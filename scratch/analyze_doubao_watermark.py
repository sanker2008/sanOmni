#!/usr/bin/env python3
"""
豆包水印分析脚本
分析豆包生成图片右下角水印的特征，为本地移除提供方案
"""

from PIL import Image
import numpy as np
import sys
from pathlib import Path

def analyze_watermark_region(image_path):
    """分析图片右下角水印区域的特征"""
    
    # 加载图片
    img = Image.open(image_path)
    width, height = img.size
    img_array = np.array(img)
    
    print(f"图片尺寸: {width} x {height}")
    print(f"图片模式: {img.mode}")
    print()
    
    # 分析不同大小的右下角区域
    regions = [
        ("10%", int(width * 0.9), int(height * 0.9), width, height),
        ("15%", int(width * 0.85), int(height * 0.85), width, height),
        ("20%", int(width * 0.8), int(height * 0.8), width, height),
    ]
    
    for name, x1, y1, x2, y2 in regions:
        print(f"=== 分析右下角 {name} 区域 ===")
        region = img_array[y1:y2, x1:x2]
        
        # 1. 颜色分析
        print("\n1. 颜色特征:")
        if len(region.shape) == 3:
            r_mean, g_mean, b_mean = region[:,:,0].mean(), region[:,:,1].mean(), region[:,:,2].mean()
            r_std, g_std, b_std = region[:,:,0].std(), region[:,:,1].std(), region[:,:,2].std()
            print(f"   RGB均值: R={r_mean:.1f}, G={g_mean:.1f}, B={b_mean:.1f}")
            print(f"   RGB标准差: R={r_std:.1f}, G={g_std:.1f}, B={b_std:.1f}")
            
            # 检查是否有白色/浅色文字
            bright_pixels = np.sum((region[:,:,0] > 200) & (region[:,:,1] > 200) & (region[:,:,2] > 200))
            total_pixels = region.shape[0] * region.shape[1]
            bright_ratio = bright_pixels / total_pixels * 100
            print(f"   亮色像素比例: {bright_ratio:.2f}%")
            
            # 检查是否有深色文字
            dark_pixels = np.sum((region[:,:,0] < 100) & (region[:,:,1] < 100) & (region[:,:,2] < 100))
            dark_ratio = dark_pixels / total_pixels * 100
            print(f"   暗色像素比例: {dark_ratio:.2f}%")
        
        # 2. 边缘检测
        print("\n2. 边缘特征:")
        if len(region.shape) == 3:
            gray = 0.299 * region[:,:,0] + 0.587 * region[:,:,1] + 0.114 * region[:,:,2]
        else:
            gray = region
        
        # 简单的边缘检测
        if gray.shape[0] > 1 and gray.shape[1] > 1:
            edges_h = np.abs(np.diff(gray, axis=1))
            edges_v = np.abs(np.diff(gray, axis=0))
            edge_strength = (edges_h.mean() + edges_v.mean()) / 2
            print(f"   边缘强度: {edge_strength:.2f}")
            
            # 强边缘像素
            strong_edges = np.sum(edges_h > 30) + np.sum(edges_v > 30)
            edge_ratio = strong_edges / (gray.shape[0] * gray.shape[1]) * 100
            print(f"   强边缘比例: {edge_ratio:.2f}%")
        
        # 3. 纹理分析
        print("\n3. 纹理特征:")
        texture_variance = gray.var()
        print(f"   方差: {texture_variance:.2f}")
        
        # 4. 水平行分析（检测文字行）
        print("\n4. 水平行分析:")
        row_means = gray.mean(axis=1)
        row_std = row_means.std()
        print(f"   行亮度标准差: {row_std:.2f}")
        
        # 检测亮度峰值（可能是文字行）
        threshold = row_means.mean() + row_std * 0.5
        bright_rows = np.sum(row_means > threshold)
        print(f"   亮行数量: {bright_rows} / {len(row_means)}")
        
        print("\n" + "="*50 + "\n")
    
    # 5. 保存右下角区域用于视觉检查
    corner_size = int(min(width, height) * 0.15)
    corner = img.crop((width - corner_size, height - corner_size, width, height))
    output_path = Path(image_path).parent / "doubao_corner_analysis.png"
    corner.save(output_path)
    print(f"右下角区域已保存到: {output_path}")
    
    # 6. 生成热力图
    print("\n=== 生成亮度热力图 ===")
    corner_array = np.array(corner)
    if len(corner_array.shape) == 3:
        corner_gray = 0.299 * corner_array[:,:,0] + 0.587 * corner_array[:,:,1] + 0.114 * corner_array[:,:,2]
    else:
        corner_gray = corner_array
    
    # 找出最亮和最暗的区域
    print(f"最亮像素值: {corner_gray.max():.1f}")
    print(f"最暗像素值: {corner_gray.min():.1f}")
    print(f"平均亮度: {corner_gray.mean():.1f}")
    
    # 7. 检测可能的水印位置
    print("\n=== 水印位置检测 ===")
    # 查找亮度异常区域
    mean_brightness = corner_gray.mean()
    std_brightness = corner_gray.std()
    
    # 水印通常比背景亮或暗
    watermark_candidates = (corner_gray > mean_brightness + std_brightness) | (corner_gray < mean_brightness - std_brightness)
    watermark_ratio = np.sum(watermark_candidates) / watermark_candidates.size * 100
    print(f"可能的水印区域占比: {watermark_ratio:.2f}%")

if __name__ == "__main__":
    image_path = r"d:\dev\san\sanOmni\docs\doubao.png"
    
    if not Path(image_path).exists():
        print(f"错误: 文件不存在 {image_path}")
        sys.exit(1)
    
    print("开始分析豆包水印特征...\n")
    analyze_watermark_region(image_path)
    print("\n分析完成!")
