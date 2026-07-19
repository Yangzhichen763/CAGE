# Towards Color-faithful Low-light Image Enhancement via Adaptive Color Debiasing and Saturation Rectification

<div align="center">

[![arXiv](https://img.shields.io/badge/arXiv-Paper-b31b1b?logo=arxiv&logoColor=white)](https://github.com/Yangzhichen763/CAGE)
[![Paper](https://img.shields.io/badge/Paper-ACM%20MM%202026-2c2c2c?logo=acm&logoColor=white)](https://github.com/Yangzhichen763/CAGE)
[![Project Page](https://img.shields.io/badge/Project-Page-1a56db?logo=googlechrome&logoColor=white)](https://yangzhichen763.github.io/CAGE/)
[![Image Crop Comparator](https://img.shields.io/badge/ImageViewer-Toolkit-orange?logo=googlelens&logoColor=white)](https://github.com/Yangzhichen763/ImageCropComparator)

</div>

## TODO

* [ ] Release the official implementation of CAGE, including network code. The code will be released soon.
* [ ] Release pre-trained weights, training and inference configuration, training and inference scripts for reproducibility.
* [ ] Refactor and document code for clarity and reproducibility.

## Abstract

Low-light imaging often introduces color bias caused by the low signal-to-noise ratio and the image formation process. Although recent low-light image enhancement methods have achieved strong brightness recovery, faithful color restoration remains challenging, manifesting as overall color bias together with local under- and over-saturation. 
To address this issue, we propose CAGE, a cylindrical color correction framework with adaptive color debiasing and gamut-harmonized saturation rectification for color-faithful low-light image enhancement. We first introduce AdaLAB, a cylindrical adaptive LAB color space that provides a decoupled and image-specific basis for uniform color correction. Building on this color space, we further develop AdaCCT, an adaptive cylindrical color transform with forward and inverse transforms for the conversion between RGB and AdaLAB color space, as well as necessary color debiasing and saturation rectifacation. The forward transform suppresses embedded color bias before backbone enhancement by reorganizing the chromatic distribution through chromatic-plane shifting and scaling, while the inverse transform achieves faithful saturation rectification through out-of-gamut lightness compensation. Extensive experiments on multiple benchmarks show that CAGE achieves more faithful color restoration, specifically reduces color bias and saturation abnormality, and delivers better overall visual quality across different low-light enhancement backbones.

## Overview

![Motivation of CAGE](figures/Figure1%20Motivation.png)

![Overview of CAGE](figures/Figure2%20Overview.png)

## Main Results

![Quantitative Comparisons on LOL Datasets](figures/Table1%20Quantitative%20Comparisons%20LOL.png)

![Qualitative Comparisons on LOL Datasets](figures/Figure6%20Qualitative%20Comparisons%20LOL.png)

To ensure fairness, we retrained the backbone networks used in our method based on their released code. 
For the other comparison methods, if it does not provide pretrained weights, we retrain it using the recommended settings provided by the authors. Otherwise, we use the officially released results or pretrained weights for evaluation.
All results are evaluated using a unified measurement.
The corresponding visual comparison results will be released later.

> 💡 Following <a href="https://openaccess.thecvf.com/content/CVPR2025/papers/Yan_HVI_A_New_Color_Space_for_Low-light_Image_Enhancement_CVPR_2025_paper.pdf">HVI-CIDNet</a>, 
> we only use GT mean evaluation on LOLv1 during testing. Since LOLv1 contains only 15 testing pairs, direct metric evaluation can be sensitive to global brightness fluctuation and may obscure the comparison of color restoration and structural recovery.

## Citation

If you find this work useful in your research, please consider citing:

```bibtex
@inproceedings{yang2026cage,
  title     = {Towards Color-faithful Low-light Image Enhancement via Adaptive Color Debiasing and Saturation Rectification},
  author    = {Yang, Zhichen and Xu, Rui and Niu, Yuzhen and Li, Fusheng and Da, Hui and Cheng, Ri},
  booktitle = {Proceedings of the ACM International Conference on Multimedia},
  year      = {2026}
}
```

## License

This project is released under the Apache 2.0 License. See the [LICENSE](LICENSE) file for details.
