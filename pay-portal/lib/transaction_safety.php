<?php
declare(strict_types=1);

if (!function_exists('nister_apply_failure_resolution')) {
  function nister_apply_failure_resolution(bool $planApplied): array {
    if ($planApplied) {
      return [
        'should_refund' => false,
        'purchase_status' => 'applied',
        'error' => 'reconcile_required',
      ];
    }

    return [
      'should_refund' => true,
      'purchase_status' => 'failed',
      'error' => 'apply_failed',
    ];
  }
}
