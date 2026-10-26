<?php
declare(strict_types=1);
require __DIR__.'/../../pay-portal/lib/archive_integrity.php';
$checks=0;
function archive_check(string $name, bool $ok): void {
  global $checks;
  if (!$ok) throw new RuntimeException($name);
  $checks++; echo 'PASS archive_integrity_'.$name.PHP_EOL;
}
$hash=md5('capture');$meta=['size'=>'7','md5Checksum'=>$hash,'trashed'=>false];
archive_check('matching_file_verified',gdrive_uploaded_metadata_matches($meta,7,$hash));
$bad=$meta;unset($bad['md5Checksum']);
archive_check('missing_remote_checksum_blocks_delete',!gdrive_uploaded_metadata_matches($bad,7,$hash));
archive_check('missing_local_checksum_blocks_delete',!gdrive_uploaded_metadata_matches($meta,7,''));
$bad=$meta;$bad['md5Checksum']=md5('different');
archive_check('checksum_mismatch_blocks_delete',!gdrive_uploaded_metadata_matches($bad,7,$hash));
archive_check('size_mismatch_blocks_delete',!gdrive_uploaded_metadata_matches($meta,8,$hash));
$bad=$meta;$bad['trashed']=true;
archive_check('trashed_archive_blocks_delete',!gdrive_uploaded_metadata_matches($bad,7,$hash));
$bad=$meta;unset($bad['size']);
archive_check('missing_size_blocks_delete',!gdrive_uploaded_metadata_matches($bad,0,$hash));
archive_check('empty_capture_requires_valid_checksum',gdrive_uploaded_metadata_matches(['size'=>'0','md5Checksum'=>md5('')],0,md5('')));
echo 'Archive integrity checks passed ('.$checks.').'.PHP_EOL;
