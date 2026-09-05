<?php

use Illuminate\Support\Facades\Route;

Route::view('/', 'welcome');
Route::view('/auctions', 'welcome');
Route::view('/auctions/{auction}', 'welcome');
