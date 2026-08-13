package org.ssafy.bodybuilder.domain.custommap.dto;

import java.util.Arrays;
import java.util.List;

/** palette는 DB에 '#3b5998,#8bc4e8,#f5c422' CSV로 저장하고 API에서는 배열로 주고받는다. */
public final class PaletteCodec {

    private PaletteCodec() {
    }

    public static String join(List<String> palette) {
        return String.join(",", palette);
    }

    public static List<String> split(String palette) {
        if (palette == null || palette.isBlank()) {
            return List.of();
        }
        return Arrays.stream(palette.split(","))
                .map(String::trim)
                .filter(color -> !color.isEmpty())
                .toList();
    }
}
