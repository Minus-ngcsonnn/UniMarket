package com.unimarket.service.storage;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.ByteArrayOutputStream;
import java.util.Set;

/**
 * Removes privacy-sensitive metadata (EXIF incl. GPS location, XMP, IPTC, text comments) from newly uploaded listing
 * photos before they are stored (Stage 6.4 security fix). Works on the container structure only — the compressed
 * image data is copied unchanged, so pixels, quality and colour (ICC profiles are kept) do not change.
 *
 * <ul>
 *   <li><b>JPEG</b>: drops APP1 (Exif / XMP), APP13 (Photoshop / IPTC) and COM segments; everything from SOS on is
 *       copied verbatim.</li>
 *   <li><b>PNG</b>: drops {@code eXIf}, {@code tEXt}, {@code zTXt}, {@code iTXt} and {@code tIME} chunks.</li>
 *   <li><b>WebP</b>: drops {@code EXIF} and {@code XMP } chunks, clears the matching VP8X flags and rewrites the RIFF
 *       size.</li>
 * </ul>
 *
 * If the structure cannot be parsed (a damaged but still detectable file), the original bytes are returned and a
 * warning is logged: the upload is not refused, which keeps the previous behaviour for such files.
 * Stored photos that existed before this change are not rewritten.
 */
public final class ImageMetadataStripper {

    private static final Logger log = LoggerFactory.getLogger(ImageMetadataStripper.class);
    private static final Set<String> PNG_DROPPED = Set.of("eXIf", "tEXt", "zTXt", "iTXt", "tIME");

    private ImageMetadataStripper() {
    }

    /** @return the image without metadata, or the original bytes when its structure can't be parsed */
    public static byte[] strip(byte[] image, ImageType type) {
        try {
            return switch (type) {
                case JPEG -> stripJpeg(image);
                case PNG -> stripPng(image);
                case WEBP -> stripWebp(image);
            };
        } catch (RuntimeException ex) {
            log.warn("Could not parse a {} photo to remove its metadata; stored unchanged ({})", type, ex.getClass().getSimpleName());
            return image;
        }
    }

    // ------------------------------------------------------------------ JPEG

    static byte[] stripJpeg(byte[] in) {
        ByteArrayOutputStream out = new ByteArrayOutputStream(in.length);
        out.write(0xFF);
        out.write(0xD8);
        int pos = 2;
        while (pos < in.length) {
            if ((in[pos] & 0xFF) != 0xFF) {
                throw new IllegalArgumentException("marker expected");
            }
            int marker = in[pos + 1] & 0xFF;
            if (marker == 0xFF) { // fill byte
                pos++;
                continue;
            }
            if (marker == 0xD8 || marker == 0x01 || (marker >= 0xD0 && marker <= 0xD7)) { // markers without length
                out.write(in, pos, 2);
                pos += 2;
                continue;
            }
            if (marker == 0xD9) { // EOI
                out.write(in, pos, 2);
                return out.toByteArray();
            }
            int length = ((in[pos + 2] & 0xFF) << 8) | (in[pos + 3] & 0xFF);
            if (length < 2 || pos + 2 + length > in.length) {
                throw new IllegalArgumentException("bad segment length");
            }
            if (marker == 0xDA) { // start of scan: the rest is image data
                out.write(in, pos, in.length - pos);
                return out.toByteArray();
            }
            boolean drop = marker == 0xE1 || marker == 0xED || marker == 0xFE;
            if (!drop) {
                out.write(in, pos, 2 + length);
            }
            pos += 2 + length;
        }
        throw new IllegalArgumentException("no image data");
    }

    // ------------------------------------------------------------------ PNG

    static byte[] stripPng(byte[] in) {
        ByteArrayOutputStream out = new ByteArrayOutputStream(in.length);
        out.write(in, 0, 8);
        int pos = 8;
        while (pos + 12 <= in.length) {
            long length = readIntBigEndian(in, pos);
            if (length < 0 || pos + 12 + length > in.length) {
                throw new IllegalArgumentException("bad chunk length");
            }
            String chunkType = new String(in, pos + 4, 4, java.nio.charset.StandardCharsets.US_ASCII);
            int total = (int) (12 + length);
            if (!PNG_DROPPED.contains(chunkType)) {
                out.write(in, pos, total);
            }
            pos += total;
            if (chunkType.equals("IEND")) {
                return out.toByteArray();
            }
        }
        throw new IllegalArgumentException("no IEND chunk");
    }

    // ------------------------------------------------------------------ WebP

    static byte[] stripWebp(byte[] in) {
        if (in.length < 12) {
            throw new IllegalArgumentException("too short");
        }
        ByteArrayOutputStream body = new ByteArrayOutputStream(in.length);
        int vp8xOffset = -1;
        int pos = 12;
        while (pos + 8 <= in.length) {
            String fourcc = new String(in, pos, 4, java.nio.charset.StandardCharsets.US_ASCII);
            long size = readIntLittleEndian(in, pos + 4);
            long padded = size + (size & 1);
            if (size < 0 || pos + 8 + padded > in.length + (size & 1)) {
                throw new IllegalArgumentException("bad chunk size");
            }
            int total = (int) Math.min(8 + padded, in.length - pos);
            if (!fourcc.equals("EXIF") && !fourcc.equals("XMP ")) {
                if (fourcc.equals("VP8X")) {
                    vp8xOffset = 12 + body.size();
                }
                body.write(in, pos, total);
            }
            pos += total;
        }
        byte[] chunks = body.toByteArray();
        byte[] out = new byte[12 + chunks.length];
        System.arraycopy(in, 0, out, 0, 12);
        System.arraycopy(chunks, 0, out, 12, chunks.length);
        writeIntLittleEndian(out, 4, out.length - 8);
        if (vp8xOffset >= 0) {
            out[vp8xOffset + 8] &= (byte) ~0x0C; // clear EXIF (0x08) and XMP (0x04) flags
        }
        return out;
    }

    private static long readIntBigEndian(byte[] b, int at) {
        return ((long) (b[at] & 0xFF) << 24) | ((b[at + 1] & 0xFF) << 16) | ((b[at + 2] & 0xFF) << 8) | (b[at + 3] & 0xFF);
    }

    private static long readIntLittleEndian(byte[] b, int at) {
        return ((long) (b[at + 3] & 0xFF) << 24) | ((b[at + 2] & 0xFF) << 16) | ((b[at + 1] & 0xFF) << 8) | (b[at] & 0xFF);
    }

    private static void writeIntLittleEndian(byte[] b, int at, int value) {
        b[at] = (byte) value;
        b[at + 1] = (byte) (value >>> 8);
        b[at + 2] = (byte) (value >>> 16);
        b[at + 3] = (byte) (value >>> 24);
    }
}
