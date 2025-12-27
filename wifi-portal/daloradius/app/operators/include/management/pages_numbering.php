<?php
// Clean, PHP 8-safe pagination helper for daloRADIUS (drop-in replacement)

if (strpos($_SERVER['PHP_SELF'] ?? '', '/include/management/pages_numbering.php') !== false) {
    header('Location: ../../index.php');
    exit;
}

$default_rpp = 25;
if (isset($configValues['CONFIG_IFACE_TABLES_LISTING_NUM']) && is_numeric($configValues['CONFIG_IFACE_TABLES_LISTING_NUM'])) {
    $default_rpp = (int)$configValues['CONFIG_IFACE_TABLES_LISTING_NUM'];
} elseif (isset($configValues['CONFIG_IFACE_TABLES_LISTING']) && is_numeric($configValues['CONFIG_IFACE_TABLES_LISTING'])) {
    $default_rpp = (int)$configValues['CONFIG_IFACE_TABLES_LISTING'];
}

$rowsPerPage = $rowsPerPage ?? null;
if ($rowsPerPage === null && isset($_REQUEST['show'])) {
    $s = $_REQUEST['show'];
    if (is_numeric($s)) {
        $rowsPerPage = (int)$s;
    } else {
        $s = strtolower((string)$s);
        if (in_array($s, ['full','all','*','unlimited'], true) && isset($numrows) && is_numeric($numrows)) {
            $rowsPerPage = (int)$numrows;
        }
    }
}
if (!is_numeric($rowsPerPage)) {
    $rowsPerPage = $default_rpp;
}
$rowsPerPage = max(1, (int)$rowsPerPage);

$numrows = isset($numrows) ? (int)$numrows : 0;
$maxPage = max(1, (int)ceil($numrows / max(1,$rowsPerPage)));

$pageNum = 1;
if (isset($_REQUEST['page']) && is_numeric($_REQUEST['page'])) {
    $pageNum = max(1, (int)$_REQUEST['page']);
}
if ($pageNum > $maxPage) { $pageNum = $maxPage; }

$offset = ($pageNum - 1) * $rowsPerPage;

/* ----- helpers ---------------------------------------------------- */

if (!function_exists('_daloradius_query_suffix')) {
function _daloradius_query_suffix($request1="", $request2="", $request3="") {
    $extra = '';
    foreach ([$request1, $request2, $request3] as $r) {
        if ($r === '' || $r === null) { continue; }
        $r = (string)$r;
        $extra .= (str_starts_with($r, '&') || str_starts_with($r, '?')) ? $r : '&'.$r;
    }
    return $extra;
}}

if (!function_exists('setupLinks_str')) {
function setupLinks_str($pageNum, $maxPage, $orderBy, $orderType, $request1="", $request2="", $request3="") {
    $pageNum  = max(1,(int)$pageNum);
    $maxPage  = max(1,(int)$maxPage);
    $orderBy  = urlencode((string)$orderBy);
    $orderType= urlencode((string)$orderType);
    $extra    = _daloradius_query_suffix($request1,$request2,$request3);

    $makeHref = function($p) use ($orderBy,$orderType,$extra) {
        return sprintf('?page=%d&orderBy=%s&orderType=%s%s', (int)$p, $orderBy, $orderType, $extra);
    };

    $html = '<nav aria-label="pagination"><ul class="pagination justify-content-center">';

    // first/prev
    if ($pageNum > 1) {
        $html .= '<li class="page-item"><a class="page-link" href="'.$makeHref(1).'">&laquo;</a></li>';
        $html .= '<li class="page-item"><a class="page-link" href="'.$makeHref($pageNum-1).'">&lsaquo;</a></li>';
    } else {
        $html .= '<li class="page-item disabled"><span class="page-link">&laquo;</span></li>';
        $html .= '<li class="page-item disabled"><span class="page-link">&lsaquo;</span></li>';
    }

    // window of page numbers
    $win = 2;
    $start = max(1, $pageNum - $win);
    $end   = min($maxPage, $pageNum + $win);
    if ($start > 1) {
        $html .= '<li class="page-item"><a class="page-link" href="'.$makeHref(1).'">1</a></li>';
        if ($start > 2) $html .= '<li class="page-item disabled"><span class="page-link">…</span></li>';
    }
    for ($i=$start; $i<=$end; $i++) {
        if ($i === $pageNum) {
            $html .= '<li class="page-item active" aria-current="page"><span class="page-link">'.$i.'</span></li>';
        } else {
            $html .= '<li class="page-item"><a class="page-link" href="'.$makeHref($i).'">'.$i.'</a></li>';
        }
    }
    if ($end < $maxPage) {
        if ($end < $maxPage - 1) $html .= '<li class="page-item disabled"><span class="page-link">…</span></li>';
        $html .= '<li class="page-item"><a class="page-link" href="'.$makeHref($maxPage).'">'.$maxPage.'</a></li>';
    }

    // next/last
    if ($pageNum < $maxPage) {
        $html .= '<li class="page-item"><a class="page-link" href="'.$makeHref($pageNum+1).'">&rsaquo;</a></li>';
        $html .= '<li class="page-item"><a class="page-link" href="'.$makeHref($maxPage).'">&raquo;</a></li>';
    } else {
        $html .= '<li class="page-item disabled"><span class="page-link">&rsaquo;</span></li>';
        $html .= '<li class="page-item disabled"><span class="page-link">&raquo;</span></li>';
    }

    $html .= '</ul></nav>';
    return $html;
}}

if (!function_exists('printLinks')) {
function printLinks($links, $drawNumberLinks) {
    if ($drawNumberLinks) {
        echo '<div class="d-flex flex-row justify-content-center">'.$links.'</div>';
    }
}}

if (!function_exists('setupNumbering_str')) {
function setupNumbering_str($numrows, $rowsPerPage, $pageNum, $orderBy, $orderType, $request1="", $request2="", $request3="") {
    $maxPage = max(1, (int)ceil((int)$numrows / max(1,(int)$rowsPerPage)));
    return setupLinks_str(max(1,(int)$pageNum), $maxPage, $orderBy, $orderType, $request1, $request2, $request3);
}}
if (!function_exists('setupNumbering')) {
function setupNumbering($numrows, $rowsPerPage, $pageNum, $orderBy, $orderType, $request1="", $request2="", $request3="") {
    echo setupNumbering_str($numrows, $rowsPerPage, $pageNum, $orderBy, $orderType, $request1, $request2, $request3);
}}
