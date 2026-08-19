      // ── Dashboard monitoring (owner/admin) — agregasi via RPC Postgres ────
      //  Server-side (satu panggilan RPC) → payload kecil, ringan.
      window.gsRoute('getDashboardProject', {
        mode: 'fn',
        handler: async function () {
          var r = await supa.rpc('dashboard_project');
          if (r.error) return { success: false, message: r.error.message };
          return { success: true, data: r.data || {} };
        }
      });
      window.gsRoute('getDashboardProcurement', {
        mode: 'fn',
        handler: async function () {
          var r = await supa.rpc('dashboard_procurement');
          if (r.error) return { success: false, message: r.error.message };
          return { success: true, data: r.data || {} };
        }
      });
