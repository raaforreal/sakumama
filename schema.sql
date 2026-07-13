CREATE TABLE `barang` (
  `barang_id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `barcode` varchar(30) NOT NULL,
  `nama_barang` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `harga_beli` int NOT NULL,
  `harga_jual` int NOT NULL,
  `stok` int NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  `is_deleted` tinyint(1) NOT NULL,
  PRIMARY KEY (`barang_id`) USING BTREE,
  KEY `user_id2` (`user_id`),
  CONSTRAINT `user_id2` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`)
) ENGINE=InnoDB AUTO_INCREMENT=61 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `barang_keluar` (
  `barang_keluar_id` int NOT NULL AUTO_INCREMENT,
  `barang_id` int NOT NULL,
  `pelanggan_id` int DEFAULT NULL,
  `jumlah` int NOT NULL,
  `tipe_keluar` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `total_harga` int NOT NULL,
  `tanggal` date NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  `nama_barang_snapshot` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `harga_beli_snapshot` int NOT NULL,
  `harga_jual_snapshot` int NOT NULL,
  PRIMARY KEY (`barang_keluar_id`) USING BTREE,
  KEY `barang_id2` (`barang_id`),
  KEY `pelanggan_id2` (`pelanggan_id`),
  CONSTRAINT `barang_id2` FOREIGN KEY (`barang_id`) REFERENCES `barang` (`barang_id`),
  CONSTRAINT `pelanggan_id2` FOREIGN KEY (`pelanggan_id`) REFERENCES `pelanggan` (`pelanggan_id`)
) ENGINE=InnoDB AUTO_INCREMENT=131 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `barang_masuk` (
  `barang_masuk_id` int NOT NULL AUTO_INCREMENT,
  `barang_id` int NOT NULL,
  `jumlah` int NOT NULL,
  `tanggal` date NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  `nama_barang_snapshot` varchar(50) NOT NULL,
  `harga_beli_snapshot` int NOT NULL,
  `harga_jual_snapshot` int NOT NULL,
  PRIMARY KEY (`barang_masuk_id`) USING BTREE,
  KEY `barang_id` (`barang_id`),
  CONSTRAINT `barang_id` FOREIGN KEY (`barang_id`) REFERENCES `barang` (`barang_id`)
) ENGINE=InnoDB AUTO_INCREMENT=185 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `catatan_hutang` (
  `hutang_id` int NOT NULL AUTO_INCREMENT,
  `pelanggan_id` int NOT NULL,
  `jenis_transaksi` enum('Hutang','Bayar') NOT NULL,
  `nominal` int NOT NULL,
  `keterangan` text NOT NULL,
  `tanggal` date NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  PRIMARY KEY (`hutang_id`) USING BTREE,
  KEY `pelanggan_id` (`pelanggan_id`),
  CONSTRAINT `pelanggan_id` FOREIGN KEY (`pelanggan_id`) REFERENCES `pelanggan` (`pelanggan_id`)
) ENGINE=InnoDB AUTO_INCREMENT=101 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `pelanggan` (
  `pelanggan_id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `nama_pelanggan` varchar(50) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  PRIMARY KEY (`pelanggan_id`) USING BTREE,
  KEY `user_id` (`user_id`),
  CONSTRAINT `user_id` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`)
) ENGINE=InnoDB AUTO_INCREMENT=21 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `users` (
  `user_id` int NOT NULL AUTO_INCREMENT,
  `nama_toko` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `username` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `pin` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `jawaban_keamanan` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  `foto_profil` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  PRIMARY KEY (`user_id`) USING BTREE
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

