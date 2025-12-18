<?php
session_start();

$file = "count.txt";

/* 同一個 session 只算一次 */
if (!isset($_SESSION['counted'])) {

    if (!file_exists($file)) {
        file_put_contents($file, "0");
    }

    $fp = fopen($file, "c+");
    flock($fp, LOCK_EX);

    $size = filesize($file);
    $count = $size > 0 ? intval(trim(fread($fp, $size))) : 0;
    $count++;

    ftruncate($fp, 0);
    rewind($fp);
    fwrite($fp, $count);

    flock($fp, LOCK_UN);
    fclose($fp);

    $_SESSION['counted'] = true;
} else {
    $count = intval(trim(file_get_contents($file)));
}

echo $count;
