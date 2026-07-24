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


def is_image_file(image_path):
    image_path = Path(image_path)

    return (
        image_path.is_file()
        and image_path.suffix.lower() in IMAGE_EXTENSIONS
    )


def validate_image_file(image_path, argument_name):
    image_path = Path(image_path)

    if not image_path.exists():
        raise FileNotFoundError(
            f"{argument_name} does not exist: {image_path}"
        )

    if not image_path.is_file():
        raise ValueError(
            f"{argument_name} is not an image file: {image_path}"
        )

    if image_path.suffix.lower() not in IMAGE_EXTENSIONS:
        raise ValueError(
            f"Unsupported image extension for {argument_name}: "
            f"{image_path.suffix}"
        )


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

    else:
        raise ValueError(
            f"Unsupported image shape {image.shape}: {image_path}"
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


def build_image_pairs(input_path, gt_path):
    input_path = Path(input_path)
    gt_path = Path(gt_path)

    if not input_path.exists():
        raise FileNotFoundError(
            f"Input path does not exist: {input_path}"
        )

    if not gt_path.exists():
        raise FileNotFoundError(
            f"GT path does not exist: {gt_path}"
        )

    input_is_file = input_path.is_file()
    gt_is_file = gt_path.is_file()

    input_is_dir = input_path.is_dir()
    gt_is_dir = gt_path.is_dir()

    if input_is_file and gt_is_file:
        validate_image_file(
            image_path=input_path,
            argument_name="Input image",
        )

        validate_image_file(
            image_path=gt_path,
            argument_name="GT image",
        )

        image_pairs = [
            {
                "key": input_path.stem,
                "input_path": input_path,
                "gt_path": gt_path,
                "relative_input_path": Path(input_path.name),
            }
        ]

        return image_pairs, True

    if input_is_dir and gt_is_dir:
        input_index = build_image_index(input_path)
        gt_index = build_image_index(gt_path)

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

        image_pairs = []

        for relative_key in matched_keys:
            current_input_path = input_index[relative_key]
            current_gt_path = gt_index[relative_key]

            image_pairs.append(
                {
                    "key": relative_key,
                    "input_path": current_input_path,
                    "gt_path": current_gt_path,
                    "relative_input_path": (
                        current_input_path.relative_to(input_path)
                    ),
                }
            )

        return image_pairs, False

    raise ValueError(
        "--input and --gt must both be image files "
        "or both be image folders."
    )


def resolve_save_path(
    output_path,
    relative_input_path,
    single_image_mode,
):
    output_path = Path(output_path)

    if single_image_mode:
        if output_path.exists() and output_path.is_dir():
            return output_path / relative_input_path.name

        if output_path.suffix.lower() in IMAGE_EXTENSIONS:
            return output_path

        if output_path.exists() and output_path.is_file():
            raise ValueError(
                f"Unsupported output image extension: {output_path}"
            )

        return output_path / relative_input_path.name

    if output_path.exists() and output_path.is_file():
        raise ValueError(
            "Directory input requires --output to be a folder: "
            f"{output_path}"
        )

    if (
        not output_path.exists()
        and output_path.suffix.lower() in IMAGE_EXTENSIONS
    ):
        raise ValueError(
            "Directory input requires --output to be a folder, "
            "not an image file."
        )

    return output_path / relative_input_path


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

    input_path = Path(args.input)
    gt_path = Path(args.gt)
    output_path = Path(args.output)

    image_pairs, single_image_mode = build_image_pairs(
        input_path=input_path,
        gt_path=gt_path,
    )

    print(f"Matched image pairs: {len(image_pairs)}")
    print(f"Device: {device}")
    print(f"Output: {output_path}")

    progress_bar = tqdm(
        image_pairs,
        total=len(image_pairs),
        desc="Generating images",
        unit="image",
        dynamic_ncols=True,
    )

    with torch.inference_mode():
        for image_pair in progress_bar:
            relative_key = image_pair["key"]
            current_input_path = image_pair["input_path"]
            current_gt_path = image_pair["gt_path"]
            relative_input_path = image_pair["relative_input_path"]

            lq_image, lq_dtype = read_image_as_tensor(
                image_path=current_input_path,
                device=device,
            )

            gt_image, _ = read_image_as_tensor(
                image_path=current_gt_path,
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

            save_path = resolve_save_path(
                output_path=output_path,
                relative_input_path=relative_input_path,
                single_image_mode=single_image_mode,
            )

            save_tensor_as_image(
                image_tensor=enhanced_image,
                save_path=save_path,
                original_dtype=lq_dtype,
            )

            progress_bar.set_postfix_str(
                f"{relative_input_path.as_posix()} | "
                f"ratio={gamma_ratio.item():.6f}"
            )

    print(f"Generated {len(image_pairs)} images.")
    print(f"Saved to: {output_path}")


def parse_args():
    parser = argparse.ArgumentParser(
        description=(
            "Generate GT-guided gamma-transformed images "
            "from image files or folders."
        )
    )

    parser.add_argument(
        "--input",
        "-i",
        required=True,
        help="Input image file or image folder.",
    )

    parser.add_argument(
        "--gt",
        "-g",
        required=True,
        help="GT image file or image folder.",
    )

    parser.add_argument(
        "--output",
        "-o",
        required=True,
        help="Output image file or output folder.",
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
    # Single image, save to a specified image file:
    # python tools/to_gt_mean.py -i examples/input.png -g examples/gt.png -o examples/enlightened.png
    #
    # Single image, save to a folder:
    # python tools/to_gt_mean.py -i examples/input.png -g examples/gt.png -o examples/enlightened
    #
    # Image folders:
    # python tools/to_gt_mean.py -i examples/input -g examples/gt -o examples/enlightened
    #
    # GPU:
    # python tools/to_gt_mean.py -i examples/input -g examples/gt -o examples/enlightened --device cuda:0

    main()