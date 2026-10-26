<?php
declare(strict_types=1);

function gdrive_uploaded_metadata_matches(array $meta, int $localSize, string $localMd5): bool {
  $remoteSize = $meta['size'] ?? null;
  $localMd5 = strtolower($localMd5);
  $remoteMd5 = strtolower((string)($meta['md5Checksum'] ?? ''));
  return empty($meta['trashed']) && $localSize >= 0 && $remoteSize !== null
    && ctype_digit((string)$remoteSize) && (int)$remoteSize === $localSize
    && preg_match('/^[a-f0-9]{32}$/D', $localMd5) === 1
    && preg_match('/^[a-f0-9]{32}$/D', $remoteMd5) === 1
    && hash_equals($localMd5, $remoteMd5);
}
