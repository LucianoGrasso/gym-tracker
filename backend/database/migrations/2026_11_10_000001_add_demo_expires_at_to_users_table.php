<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            // Cuentas de "Probar demo": se borran al crear la siguiente demo después de esta hora.
            $table->timestamp('demo_expires_at')->nullable()->index();
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropIndex(['demo_expires_at']);
            $table->dropColumn('demo_expires_at');
        });
    }
};
