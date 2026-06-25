# Build Script for Pro Background Removal Engine
# 需要在拥有完整依赖的 Python 环境中执行

Write-Host "Checking dependencies..."
python -c "import rembg; import PIL; import cv2" 
if ($LASTEXITCODE -ne 0) {
    Write-Host "Missing dependencies! Please run: pip install rembg Pillow opencv-python pyinstaller" -ForegroundColor Red
    exit 1
}

Write-Host "Installing PyInstaller if needed..."
pip install pyinstaller

Write-Host "Starting PyInstaller build..."
# 使用 --onedir 或者 --onefile，考虑到深度学习模型和 onnxruntime，
# --onedir (默认不加 --onefile) 启动速度更快，如果只要单文件请加上 --onefile
# 我们这里使用 --onefile 打包成单独的 exe，方便分发，但启动会稍微慢几秒因为需要解压临时文件
pyinstaller --noconfirm --onefile --console --name "pro_bg_engine" .\pro_bg_engine.py

Write-Host "Build complete! Check the 'dist' folder for pro_bg_engine.exe" -ForegroundColor Green
