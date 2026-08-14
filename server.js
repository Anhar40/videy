const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

require("dotenv").config();

const cloudinary =
    require("cloudinary").v2;


/*
 * Deteksi lingkungan Vercel.
 * Vercel mengeset variabel ini secara otomatis.
 * Di serverless, filesystem hanya bisa dibaca
 * (hanya /tmp yang writable).
 */

const isVercel =
    Boolean(
        process.env.VERCEL ||
        process.env.VERCEL_ENV
    );


/*
 * Konfigurasi Cloudinary dari env.
 *
 * Bisa lewat CLOUDINARY_URL:
 *   cloudinary://API_KEY:API_SECRET@CLOUD_NAME
 *
 * Atau lewat variabel terpisah:
 *   CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET
 *
 * Jangan crash saat env belum tersedia.
 */

const cloudinaryUrl =
    process.env.CLOUDINARY_URL
        ? new URL(
            process.env.CLOUDINARY_URL
        )
        : null;


cloudinary.config({

    cloud_name:
        process.env.CLOUDINARY_CLOUD_NAME ||
        (
            cloudinaryUrl
                ? cloudinaryUrl.hostname
                : undefined
        ),

    api_key:
        process.env.CLOUDINARY_API_KEY ||
        (
            cloudinaryUrl
                ? cloudinaryUrl.username
                : undefined
        ),

    api_secret:
        process.env.CLOUDINARY_API_SECRET ||
        (
            cloudinaryUrl
                ? cloudinaryUrl.password
                : undefined
        )

});


const app = express();

const PORT = 3000;

// ============================================
// DIRECTORIES
// ============================================

const PUBLIC_DIR = __dirname;
const VIDEO_DIR = path.join(__dirname, "videos");

// Buat folder otomatis (hanya lokal;
// di Vercel filesystem bersifat read-only).
if (!isVercel && !fs.existsSync(VIDEO_DIR)) {

    try {

        fs.mkdirSync(VIDEO_DIR, {
            recursive: true
        });

    }

    catch (error) {

        console.error(
            "Gagal membuat folder videos:",
            error
        );

    }

}


// ============================================
// MIDDLEWARE
// ============================================

app.use(express.json());

app.use(
    express.urlencoded({
        extended: true
    })
);


// ============================================
// STATIC FILES
// ============================================
//
// Lokal: Express melayani file statis.
// Vercel: file statis (index.html, preview.html,
// videos.json) disajikan oleh filesystem Vercel,
// jadi jangan daftarkan express.static di sini.

if (!isVercel) {

    // Frontend
    app.use(
        express.static(PUBLIC_DIR)
    );

    // Video yang diputar
    app.use(
        "/videos",
        express.static(VIDEO_DIR)
    );

}


// ============================================
// MULTER CONFIG
// ============================================

// Rekaman disimpan di memori,
// langsung diunggah ke Cloudinary,
// tidak disimpan ke disk lokal.

const storage =
    multer.memoryStorage();


// ============================================
// FILE FILTER
// ============================================

const fileFilter =
    function (
        req,
        file,
        cb
    ) {

        const allowedTypes = [

            "video/webm",

            "video/mp4",

            "video/ogg",

            "video/x-matroska"

        ];

        if (
            allowedTypes.includes(
                file.mimetype
            )
        ) {

            cb(
                null,
                true
            );

        } else {

            cb(
                new Error(
                    "Format video tidak didukung."
                ),
                false
            );

        }

    };


// ============================================
// UPLOAD
// ============================================

const upload =
    multer({

        storage,

        fileFilter,

        limits: {

            // Maksimum 500 MB
            fileSize:
                500 * 1024 * 1024

        }

    });


// ============================================
// HOME
// ============================================
//
// Lokal: kirim index.html.
// Vercel: halaman disajikan filesystem Vercel,
// jadi hanya berfungsi sebagai fallback.

app.get(
    "/",
    function (
        req,
        res
    ) {

        const indexPath =
            path.join(
                __dirname,
                "index.html"
            );


        if (fs.existsSync(indexPath)) {

            return res.sendFile(
                indexPath
            );

        }


        res
            .status(200)
            .send(
                "Videy - server berjalan."
            );

    }
);


// ============================================
// SERVER STATUS
// ============================================

app.get(
    "/api/status",
    function (
        req,
        res
    ) {

        res.json({

            success: true,

            server:
                "Camera Video Recorder",

            status:
                "online",

            port:
                PORT,

            timestamp:
                new Date().toISOString()

        });

    }
);


// ============================================
// SIGNATURE UPLOAD LANGSUNG KE CLOUDINARY
// ============================================
//
// Rekaman besar di-upload langsung dari browser
// ke Cloudinary (melewati serverless function yang
// membatasi body 4.5 MB di Vercel).
//
// Endpoint ini hanya membuat signature yang
// ditandatangani server, tanpa menerima file.

app.get(
    "/api/upload-signature",

    function (
        req,
        res
    ) {

        try {

            const timestamp =
                Math.round(
                    Date.now() / 1000
                );


            const filename =
                req.query.filename;


            const paramsToSign =
                {

                    timestamp,

                    folder:
                        "recordings"

                };


            if (filename) {

                paramsToSign.public_id =
                    String(filename);

            }


            const signature =
                cloudinary
                    .utils
                    .api_sign_request(
                        paramsToSign,
                        cloudinary
                            .config()
                            .api_secret
                    );


            res.json({

                success: true,

                cloud_name:
                    cloudinary
                        .config()
                        .cloud_name,

                api_key:
                    cloudinary
                        .config()
                        .api_key,

                timestamp,

                folder:
                    "recordings",

                signature

            });

        }

        catch (error) {

            console.error(
                error
            );

            res
                .status(500)
                .json({

                    success: false,

                    message:
                        "Gagal membuat signature upload."

                });

        }

    }
);


// ============================================
// UPLOAD CAMERA RECORDING
// ============================================
//
// Dipakai sebagai fallback (misalnya upload
// saat keluar halaman via sendBeacon).
// Untuk upload normal, browser langsung
// mengunggah ke Cloudinary pakai signature.

app.post(
    "/api/recordings/upload",

    upload.single("recording"),

    function (
        req,
        res
    ) {

        try {

            if (!req.file) {

                return res
                    .status(400)
                    .json({

                        success: false,

                        message:
                            "File recording tidak ditemukan."

                    });

            }


            const file =
                req.file;


            console.log(
                "Recording diterima:"
            );

            console.log(
                file.originalname
            );


            const timestamp =
                Date.now();

            const random =
                Math.random()
                    .toString(36)
                    .substring(2, 10);

            // MediaRecorder biasanya webm
            const extension =
                path.extname(
                    file.originalname
                ) || ".webm";


            cloudinary
                .uploader
                .upload_stream(
                    {

                        resource_type:
                            "video",

                        folder:
                            "recordings",

                        public_id:
                            `camera-${timestamp}-${random}`,

                        format:
                            extension.slice(1)

                    },
                    function (
                        error,
                        result
                    ) {

                        if (error) {

                            console.error(
                                error
                            );

                            return res
                                .status(500)
                                .json({

                                    success: false,

                                    message:
                                        "Gagal mengunggah recording ke Cloudinary."

                                });

                        }


                        console.log(
                            "Cloudinary:",
                            result.public_id
                        );


                        res.json({

                            success: true,

                            message:
                                "Recording berhasil disimpan ke Cloudinary.",

                            recording: {

                                filename:
                                    result.public_id,

                                originalName:
                                    file.originalname,

                                mimetype:
                                    file.mimetype,

                                size:
                                    file.size,

                                url:
                                    result.secure_url,

                                createdAt:
                                    result.created_at

                            }

                        });

                    }
                )
                .end(
                    file.buffer
                );

        }

        catch (error) {

            console.error(
                error
            );

            res
                .status(500)
                .json({

                    success: false,

                    message:
                        "Gagal menyimpan recording."

                });

        }

    }
);


// ============================================
// GET ALL RECORDINGS
// ============================================

app.get(
    "/api/recordings",

    async function (
        req,
        res
    ) {

        try {

            const result =
                await cloudinary
                    .api
                    .resources({

                        type:
                            "upload",

                        resource_type:
                            "video",

                        prefix:
                            "recordings/",

                        max_results:
                            500

                    });


            const recordings =
                result
                    .resources
                    .map(
                        function (
                            resource
                        ) {

                            return {

                                filename:
                                    resource.public_id,

                                size:
                                    resource.bytes,

                                createdAt:
                                    resource.created_at,

                                url:
                                    resource.secure_url

                            };

                        }
                    )
                    .sort(
                        function (
                            a,
                            b
                        ) {

                            return (
                                new Date(
                                    b.createdAt
                                ) -
                                new Date(
                                    a.createdAt
                                )
                            );

                        }
                    );


            res.json({

                success: true,

                total:
                    recordings.length,

                recordings

            });

        }

        catch (error) {

            console.error(
                error
            );

            res
                .status(500)
                .json({

                    success: false,

                    message:
                        "Gagal mengambil recording."

                });

        }

    }
);


// ============================================
// GET SINGLE RECORDING
// ============================================

app.get(
    "/api/recordings/:filename",

    async function (
        req,
        res
    ) {

        try {

            const publicId =
                decodeURIComponent(
                    req.params.filename
                );


            const resource =
                await cloudinary
                    .api
                    .resource(
                        publicId,
                        {
                            resource_type:
                                "video"
                        }
                    );


            res.json({

                success: true,

                recording: {

                    filename:
                        resource.public_id,

                    size:
                        resource.bytes,

                    createdAt:
                        resource.created_at,

                    url:
                        resource.secure_url

                }

            });

        }

        catch (error) {

            console.error(
                error
            );

            res
                .status(404)
                .json({

                    success: false,

                    message:
                        "Recording tidak ditemukan."

                });

        }

    }
);


// ============================================
// DELETE RECORDING
// ============================================

app.delete(
    "/api/recordings/:filename",

    async function (
        req,
        res
    ) {

        try {

            const publicId =
                decodeURIComponent(
                    req.params.filename
                );


            const result =
                await cloudinary
                    .uploader
                    .destroy(
                        publicId,
                        {
                            resource_type:
                                "video"
                        }
                    );


            if (
                result.result ===
                "not found"
            ) {

                return res
                    .status(404)
                    .json({

                        success: false,

                        message:
                            "Recording tidak ditemukan."

                    });

            }


            res.json({

                success: true,

                message:
                    "Recording berhasil dihapus."

            });

        }

        catch (error) {

            console.error(
                error
            );

            res
                .status(500)
                .json({

                    success: false,

                    message:
                        "Gagal menghapus recording."

                });

        }

    }
);


// ============================================
// ERROR HANDLER
// ============================================

app.use(
    function (
        error,
        req,
        res,
        next
    ) {

        console.error(
            error
        );


        if (
            error instanceof
            multer.MulterError
        ) {

            if (
                error.code ===
                "LIMIT_FILE_SIZE"
            ) {

                return res
                    .status(413)
                    .json({

                        success: false,

                        message:
                            "Ukuran recording terlalu besar. Maksimal 500 MB."

                    });

            }

        }


        res
            .status(400)
            .json({

                success: false,

                message:
                    error.message ||
                    "Terjadi kesalahan."

            });

    }
);


// ============================================
// START SERVER
// ============================================
//
// Di Vercel, app diekspor sebagai serverless
// function (lihat api/index.js), jadi port
// hanya dibuka saat dijalankan langsung.

if (require.main === module) {

    app.listen(
        PORT,

        function () {

            console.log("");
            console.log(
                "======================================"
            );

            console.log(
                " CAMERA VIDEO RECORDER"
            );

            console.log(
                "======================================"
            );

            console.log(
                `Server : http://localhost:${PORT}`
            );

            console.log(
                `API    : http://localhost:${PORT}/api/status`
            );

            console.log(
                `Upload : POST /api/recordings/upload`
            );

            console.log(
                "======================================"
            );

            console.log("");

        }
    );

}


module.exports = app;