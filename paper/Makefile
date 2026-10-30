# LuaLaTeX (luatexja for Japanese, fontspec for IPA). Needs TeX Live with latexmk, luatexja,
# and the fonts Charis SIL, DejaVu Sans Mono and Noto Serif CJK JP.
main.pdf: main.tex references.bib
	latexmk -lualatex -interaction=nonstopmode -halt-on-error main.tex

clean:
	latexmk -C main.tex

.PHONY: clean
