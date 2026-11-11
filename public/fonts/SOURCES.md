# Bundled fonts

Geist and Geist Mono are distributed under the SIL Open Font License 1.1;
see `geist-OFL.txt` and `geist-mono-OFL.txt` alongside the font files.

The variable fonts were downloaded on 2026-11-11 from the official Google Fonts
repository and losslessly converted from TTF to WOFF2 with FontTools:

- https://github.com/google/fonts/blob/main/ofl/geist/Geist%5Bwght%5D.ttf
- https://github.com/google/fonts/blob/main/ofl/geistmono/GeistMono%5Bwght%5D.ttf

Their glyphs and variation axes are preserved. Bundling these assets removes the
Google Fonts build-time network dependency. The existing Fraunces asset is also
used for the classic heading font.
