import argparse
from pathlib import Path

import cv2
import numpy as np
import torch
from tqdm import tqdm


IMAGE_EXTENSIONS = {
    ".png",
    ".jpg",
    ".jpeg",
    ".bmp",
    ".tif",
    ".tiff",
    ".webp",
}


def get_device(device_name):
    if device_name.startswith("cuda") and not torch.cuda.is_available():
        raise RuntimeError(
            "CUDA is unavailable. Please use --device cpu "
            "or check the CUDA environment."
        )

    return torch.device(device_name)


def read_image_as_tensor(image_path, device):
    image = cv2.imread(str(image_path), cv2.IMREAD_UNCHANGED)

    if image is None:
        raise RuntimeError(f"Failed to read image: {image_path}")

    original_dtype = image.dtype

    if image.ndim == 2:
        image = np.repeat(image[..., None], 3, axis=2)

    elif image.ndim == 3:
        channel_count = image.shape[2]

        if channel_count == 1:
            image = np.repeat(image, 3, axis=2)

        elif channel_count == 3:
            image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)

        elif channel_count == 4:
            image = cv2.cvtColor(image, cv2.COLOR_BGRA2RGB)

        else:
            raise ValueError(
                f"Unsupported channel count {channel_count}: {image_path}"
            )

    image = image.astype(np.float32)

    if np.issubdtype(original_dtype, np.integer):
        image /= float(np.iinfo(original_dtype).max)

    elif image.max() > 1.0:
        image /= 255.0

    image = np.clip(image, 0.0, 1.0)
    image = np.ascontiguousarray(image.transpose(2, 0, 1))

    tensor = torch.from_numpy(image).unsqueeze(0)
    tensor = tensor.to(
        device=device,
        dtype=torch.float32,
        non_blocking=device.type == "cuda",
    )

    return tensor, original_dtype


def save_tensor_as_image(image_tensor, save_path, original_dtype):
    save_path = Path(save_path)
    save_path.parent.mkdir(parents=True, exist_ok=True)

    image = image_tensor.squeeze(0)
    image = image.clamp(0.0, 1.0)
    image = image.permute(1, 2, 0)
    image = image.detach().cpu().numpy()

    if np.issubdtype(original_dtype, np.integer):
        max_value = np.iinfo(original_dtype).max
        image = np.round(image * max_value)
        image = image.astype(original_dtype)

    else:
        image = image.astype(np.float32)

    image = cv2.cvtColor(image, cv2.COLOR_RGB2BGR)

    success = cv2.imwrite(str(save_path), image)

    if not success:
        raise RuntimeError(f"Failed to save image: {save_path}")


def build_image_index(folder):
    folder = Path(folder)

    if not folder.is_dir():
        raise NotADirectoryError(
            f"Image folder does not exist: {folder}"
        )

    image_index = {}

    for image_path in sorted(folder.rglob("*")):
        if not image_path.is_file():
            continue

        # suffix.lower() supports uppercase image suffixes.
        if image_path.suffix.lower() not in IMAGE_EXTENSIONS:
            continue

        relative_path = image_path.relative_to(folder)
        relative_key = relative_path.with_suffix("").as_posix()

        if relative_key in image_index:
            raise RuntimeError(
                "Multiple images have the same relative name: "
                f"{relative_key}"
            )

        image_index[relative_key] = image_path

    return image_index


def gamma_gtmean(lq_image, hq_image, gamma=2.2):
    exponent = 1.0 / gamma

    hq_gamma_mean = hq_image.pow(exponent).mean(
        dim=[1, 2, 3],
        keepdim=True,
    )

    lq_gamma_mean = lq_image.pow(exponent).mean(
        dim=[1, 2, 3],
        keepdim=True,
    )

    gamma_ratio = hq_gamma_mean / (lq_gamma_mean + 1e-8)

    enhanced_image = (
        lq_image * gamma_ratio
    ).pow(exponent)

    return enhanced_image, gamma_ratio


def main():
    args = parse_args()

    if args.gamma <= 0:
        raise ValueError("--gamma must be greater than 0.")

    device = get_device(args.device)

    input_dir = Path(args.input_dir)
    gt_dir = Path(args.gt_dir)
    output_dir = Path(args.output_dir)

    input_index = build_image_index(input_dir)
    gt_index = build_image_index(gt_dir)

    input_keys = set(input_index)
    gt_keys = set(gt_index)

    matched_keys = sorted(input_keys & gt_keys)
    missing_gt_keys = sorted(input_keys - gt_keys)
    missing_input_keys = sorted(gt_keys - input_keys)

    if not matched_keys:
        raise RuntimeError(
            "No matched input and GT images were found. "
            "Their relative paths and file names must correspond."
        )

    if missing_gt_keys:
        print(
            f"Warning: {len(missing_gt_keys)} input images "
            "have no matching GT images."
        )

    if missing_input_keys:
        print(
            f"Warning: {len(missing_input_keys)} GT images "
            "have no matching input images."
        )

    output_dir.mkdir(parents=True, exist_ok=True)

    print(f"Matched image pairs: {len(matched_keys)}")
    print(f"Device: {device}")
    print(f"Image folder: {output_dir}")

    progress_bar = tqdm(
        matched_keys,
        total=len(matched_keys),
        desc="Generating images",
        unit="image",
        dynamic_ncols=True,
    )

    with torch.inference_mode():
        for relative_key in progress_bar:
            input_path = input_index[relative_key]
            gt_path = gt_index[relative_key]

            lq_image, lq_dtype = read_image_as_tensor(
                image_path=input_path,
                device=device,
            )

            gt_image, _ = read_image_as_tensor(
                image_path=gt_path,
                device=device,
            )

            if lq_image.shape != gt_image.shape:
                raise ValueError(
                    f"Image shape mismatch for {relative_key}: "
                    f"input={tuple(lq_image.shape)}, "
                    f"GT={tuple(gt_image.shape)}"
                )

            enhanced_image, gamma_ratio = gamma_gtmean(
                lq_image=lq_image,
                hq_image=gt_image,
                gamma=args.gamma,
            )

            relative_input_path = input_path.relative_to(input_dir)
            save_path = output_dir / relative_input_path

            save_tensor_as_image(
                image_tensor=enhanced_image,
                save_path=save_path,
                original_dtype=lq_dtype,
            )

            progress_bar.set_postfix_str(
                f"{relative_input_path.as_posix()} | "
                f"ratio={gamma_ratio.item():.6f}"
            )

    print(f"Generated {len(matched_keys)} images.")
    print(f"Saved to: {output_dir}")


def parse_args():
    parser = argparse.ArgumentParser(
        description="Generate GT-guided gamma-transformed images."
    )

    parser.add_argument(
        "--input_dir",
        "-i",
        required=True,
        help="Input image folder.",
    )

    parser.add_argument(
        "--gt_dir",
        "-g",
        required=True,
        help="GT image folder.",
    )

    parser.add_argument(
        "--output_dir",
        "-o",
        required=True,
        help="Folder used to save generated images.",
    )

    parser.add_argument(
        "--gamma",
        type=float,
        default=2.2,
        help="Gamma value. Default: 2.2.",
    )

    parser.add_argument(
        "--device",
        default="cpu",
        help="Device name, such as cuda, cuda:0, or cpu.",
    )

    return parser.parse_args()


if __name__ == "__main__":
    # CPU:
    # python tools/to_gt_mean.py  -i .examples/input  -g .examples/gt  -o .examples/enlightened
    #
    # GPU:
    # python tools/to_gt_mean.py  -i .examples/input  -g .examples/gt  -o .examples/enlightened --device cuda:0

    main()