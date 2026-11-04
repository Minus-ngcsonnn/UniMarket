package com.unimarket.product;

import com.unimarket.service.storage.ImageMetadataStripper;
import com.unimarket.service.storage.ImageType;
import org.junit.jupiter.api.Test;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.zip.CRC32;

import static org.assertj.core.api.Assertions.assertThat;

/** Privacy metadata (EXIF GPS, XMP, IPTC, comments) is removed from uploaded photos; image data stays byte-identical. */
class ImageMetadataStripperTest {

    private static final byte[] GPS = "GPSLatitude=21.0285;GPSLongitude=105.8542".getBytes(StandardCharsets.US_ASCII);
    private static final byte[] SCAN = {0x11, 0x22, (byte) 0xFF, 0x00, 0x33, 0x44};

    // ------------------------------------------------------------------ JPEG

    private static void segment(ByteArrayOutputStream out, int marker, byte[] payload) {
        int length = payload.length + 2;
        out.write(0xFF);
        out.write(marker);
        out.write(length >> 8);
        out.write(length & 0xFF);
        out.writeBytes(payload);
    }

    private static byte[] jpeg(boolean withMetadata) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        out.write(0xFF);
        out.write(0xD8);
        segment(out, 0xE0, "JFIF\0\1\1".getBytes(StandardCharsets.US_ASCII));
        if (withMetadata) {
            ByteArrayOutputStream exif = new ByteArrayOutputStream();
            exif.writeBytes("Exif\0\0".getBytes(StandardCharsets.US_ASCII));
            exif.writeBytes(GPS);
            segment(out, 0xE1, exif.toByteArray());                                                   // EXIF with GPS
            segment(out, 0xE1, "http://ns.adobe.com/xap/1.0/\0<x:xmpmeta>GPS</x:xmpmeta>".getBytes(StandardCharsets.US_ASCII)); // XMP
            segment(out, 0xED, "Photoshop 3.0\0IPTC".getBytes(StandardCharsets.US_ASCII));
            segment(out, 0xFE, "taken at my dorm".getBytes(StandardCharsets.US_ASCII));
        }
        segment(out, 0xE2, "ICC_PROFILE\0colour".getBytes(StandardCharsets.US_ASCII));               // colour: kept
        segment(out, 0xDB, new byte[]{0, 1, 2, 3});                                                   // quantisation table
        segment(out, 0xDA, new byte[]{1, 2, 3});                                                      // start of scan
        out.writeBytes(SCAN);
        out.write(0xFF);
        out.write(0xD9);
        return out.toByteArray();
    }

    @Test
    void jpegLosesExifXmpIptcAndCommentsButKeepsColourAndImageData() {
        byte[] stripped = ImageMetadataStripper.strip(jpeg(true), ImageType.JPEG);
        String text = new String(stripped, StandardCharsets.ISO_8859_1);
        assertThat(text).doesNotContain("GPSLatitude").doesNotContain("Exif").doesNotContain("xmpmeta").doesNotContain("Photoshop")
                .doesNotContain("my dorm").contains("JFIF").contains("ICC_PROFILE");
        assertThat(stripped).isEqualTo(jpeg(false));
        assertThat(ImageType.detect(stripped)).contains(ImageType.JPEG);
    }

    @Test
    void aJpegWithoutMetadataIsUnchanged() {
        assertThat(ImageMetadataStripper.strip(jpeg(false), ImageType.JPEG)).isEqualTo(jpeg(false));
    }

    @Test
    void aDamagedJpegIsStoredUnchangedInsteadOfFailingTheUpload() {
        byte[] damaged = {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, (byte) 0xE1, 0x7F, 0x7F, 1, 2};
        assertThat(ImageMetadataStripper.strip(damaged, ImageType.JPEG)).isEqualTo(damaged);
    }

    // ------------------------------------------------------------------ PNG

    private static void chunk(ByteArrayOutputStream out, String type, byte[] data) {
        byte[] typeBytes = type.getBytes(StandardCharsets.US_ASCII);
        out.write(data.length >>> 24);
        out.write(data.length >>> 16);
        out.write(data.length >>> 8);
        out.write(data.length);
        out.writeBytes(typeBytes);
        out.writeBytes(data);
        CRC32 crc = new CRC32();
        crc.update(typeBytes);
        crc.update(data);
        long value = crc.getValue();
        out.write((int) (value >>> 24));
        out.write((int) (value >>> 16));
        out.write((int) (value >>> 8));
        out.write((int) value);
    }

    private static byte[] png(boolean withMetadata) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        out.writeBytes(new byte[]{(byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A});
        chunk(out, "IHDR", new byte[13]);
        if (withMetadata) {
            chunk(out, "eXIf", GPS);
            chunk(out, "tEXt", "Comment\0taken at my dorm".getBytes(StandardCharsets.ISO_8859_1));
            chunk(out, "iTXt", "XML:com.adobe.xmp\0\0\0\0\0GPS".getBytes(StandardCharsets.ISO_8859_1));
            chunk(out, "tIME", new byte[7]);
        }
        chunk(out, "IDAT", SCAN);
        chunk(out, "IEND", new byte[0]);
        return out.toByteArray();
    }

    @Test
    void pngLosesExifAndTextChunksButKeepsImageChunks() {
        byte[] stripped = ImageMetadataStripper.strip(png(true), ImageType.PNG);
        assertThat(new String(stripped, StandardCharsets.ISO_8859_1)).doesNotContain("GPSLatitude").doesNotContain("my dorm").contains("IHDR").contains("IDAT");
        assertThat(stripped).isEqualTo(png(false));
    }

    // ------------------------------------------------------------------ WebP

    private static void riffChunk(ByteArrayOutputStream out, String fourcc, byte[] data) {
        out.writeBytes(fourcc.getBytes(StandardCharsets.US_ASCII));
        out.write(data.length);
        out.write(data.length >>> 8);
        out.write(data.length >>> 16);
        out.write(data.length >>> 24);
        out.writeBytes(data);
        if ((data.length & 1) == 1) {
            out.write(0);
        }
    }

    private static byte[] webp(boolean withMetadata) {
        ByteArrayOutputStream chunks = new ByteArrayOutputStream();
        byte[] vp8x = new byte[10];
        vp8x[0] = (byte) (withMetadata ? 0x0C : 0x00); // EXIF + XMP flags
        riffChunk(chunks, "VP8X", vp8x);
        riffChunk(chunks, "VP8 ", SCAN);
        if (withMetadata) {
            riffChunk(chunks, "EXIF", GPS);
            riffChunk(chunks, "XMP ", "<x:xmpmeta>GPS</x:xmpmeta>".getBytes(StandardCharsets.US_ASCII));
        }
        byte[] body = chunks.toByteArray();
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        out.writeBytes("RIFF".getBytes(StandardCharsets.US_ASCII));
        int size = body.length + 4;
        out.write(size);
        out.write(size >>> 8);
        out.write(size >>> 16);
        out.write(size >>> 24);
        out.writeBytes("WEBP".getBytes(StandardCharsets.US_ASCII));
        out.writeBytes(body);
        return out.toByteArray();
    }

    @Test
    void webpLosesExifAndXmpChunksAndFlagsAndKeepsAConsistentRiffSize() {
        byte[] stripped = ImageMetadataStripper.strip(webp(true), ImageType.WEBP);
        assertThat(new String(stripped, StandardCharsets.ISO_8859_1)).doesNotContain("GPSLatitude").doesNotContain("xmpmeta");
        assertThat(stripped).isEqualTo(webp(false));
        long riffSize = (stripped[4] & 0xFF) | ((stripped[5] & 0xFF) << 8) | ((stripped[6] & 0xFF) << 16) | ((long) (stripped[7] & 0xFF) << 24);
        assertThat(riffSize).isEqualTo(stripped.length - 8);
        assertThat(ImageType.detect(stripped)).contains(ImageType.WEBP);
    }
}
