<?php
declare(strict_types=1);

function gdrive_archive_folder_usable(array $meta): bool {
  return ($meta['mimeType'] ?? '') === 'application/vnd.google-apps.folder'
    && empty($meta['trashed']) && ($meta['capabilities']['canAddChildren'] ?? true) !== false;
}

/** Recover stale cached IDs without changing the connected account or parent. */
function gdrive_resolve_archive_root(string $existing, string $parent, string $name,
    callable $metadata, callable $findOrCreate, callable $persist): string {
  if ($existing !== '') {
    try {
      $cached = $metadata($existing);
      if (gdrive_archive_folder_usable($cached)) return $existing;
      if (empty($cached['trashed'])) {
        throw new RuntimeException('google_drive_cached_archive_folder_unusable');
      }
    } catch (RuntimeException $e) {
      // A new authorization can no longer see an earlier account's folder.
      // Network/authentication/permission failures must not create replacements.
      if ($e->getCode() !== 404) throw $e;
    }
  }
  if ($parent !== '' && !gdrive_archive_folder_usable($metadata($parent))) {
    throw new RuntimeException('google_drive_parent_folder_unusable');
  }
  $root = (string)$findOrCreate($name, $parent !== '' ? $parent : null);
  if ($root === '' || !gdrive_archive_folder_usable($metadata($root))) {
    throw new RuntimeException('google_drive_archive_folder_unusable');
  }
  $persist($root);
  return $root;
}
