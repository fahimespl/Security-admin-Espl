import cv2
import time
import sys

print("Python version:", sys.version)
print("OpenCV version:", cv2.__version__)

for idx in [0, 1, 2]:
    print(f"\n=== Testing Camera Index {idx} ===")
    for name, backend in [("DSHOW", cv2.CAP_DSHOW), ("MSMF", cv2.CAP_MSMF), ("DEFAULT", None)]:
        print(f"--- Backend: {name} ---")
        try:
            cap = cv2.VideoCapture(idx, backend) if backend is not None else cv2.VideoCapture(idx)
            is_open = cap.isOpened()
            print(f"  cap.isOpened() -> {is_open}")
            if is_open:
                # Try reading a few times to give the sensor time to warm up
                for attempt in range(5):
                    ret, frame = cap.read()
                    if ret and frame is not None:
                        print(f"  SUCCESS! Frame read on attempt {attempt+1}. Shape: {frame.shape}")
                        break
                    time.sleep(0.2)
                else:
                    print("  Failed to read frame after 5 attempts.")
                cap.release()
            else:
                cap.release()
        except Exception as e:
            print(f"  Error: {e}")
