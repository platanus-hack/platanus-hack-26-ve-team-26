// Tridi's mark and wordmark, as markup the screens drop in (styles: .logo and .wm in style.css).
//
// The mark is a cube seen from above: three faces in three tones of the signal, the "3D". Its inner
// edges are a body with its arms up and its head on the top face, the chest a tracked joint: a
// person turned into 3D data for a robot, which is the product. The wordmark's two i-dots are the
// same joints, square like the keypoints Capture pulls out of a video.

export const LOGO = `<svg class="logo" viewBox="0 0 32 32" aria-hidden="true">
  <path class="logo-top" d="M16 2l12.1 7L16 16 3.9 9z"/>
  <path class="logo-left" d="M3.9 9 16 16v14L3.9 23z"/>
  <path class="logo-right" d="M28.1 9 16 16v14l12.1-7z"/>
  <path class="logo-bones" d="M16 16 6.3 10.4M16 16l9.7-5.6M16 16v11.4"/>
  <circle class="logo-joint" cx="16" cy="9.4" r="2.5"/>
  <rect class="logo-joint" x="13.7" y="13.7" width="4.6" height="4.6"/>
</svg>`;

// Dotless i (U+0131) plus a square dot of our own, so the dots can be joints.
export const WORDMARK = '<span class="wm">tr<span class="wm-i">ı</span>d<span class="wm-i">ı</span></span>';
