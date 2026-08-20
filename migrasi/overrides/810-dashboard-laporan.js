      // ── Dashboard Sales + Laporan Sales (Dashboard.gs / SalesReport.gs) ───
      //  Agregasi klien-side dari tabel penawaran. Nilai "kontrak" = max(0,
      //  subtotal-diskon) (EXCLUDE PPN) kecuali recentDeals/grandTotal (raw
      //  grand_total). Rentang tanggal inklusif & date-only (bandingkan string
      //  ISO 'YYYY-MM-DD' → aman timezone). Waktu acuan Asia/Jakarta.
      var _BULAN_ID = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
      function _epochJk(iso) { return iso ? Date.parse(iso + 'T00:00:00+07:00') : null; }        // ms, Jakarta-midnight
      function _dDaysISO(a, b) { if (!a || !b) return null; return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000); }
      function _dInRange(d, from, to) { return !!(d && d >= from && d <= to); }                  // string ISO compare
      function _accOK(pembuat, isAdmin, role, namaUser, teamNames) {
        if (role === 'leadsales') return !!(teamNames && teamNames.indexOf(pembuat) >= 0);
        if (!isAdmin) return pembuat === namaUser;
        return true;
      }

      async function _dashboardRawData(namaUser, isAdmin, role, userId) {
        try {
          namaUser = (namaUser || '').toString();
          var pq = await _all('penawaran', 'no_penawaran,rev,tanggal,tanggal_deal,nama_project,klien_id,dibuat_oleh,subtotal,diskon,grand_total,status,channel_marketing,catatan_fail');
          if (pq.error) throw new Error(pq.error.message);
          var kq = await _all('klien', 'id,nama_klien');
          var klienMap = {}; (kq.data || []).forEach(function (k) { if (k.id != null) klienMap[k.id.toString()] = k.nama_klien || ''; });
          var prodC = await supa.from('produk').select('id', { count: 'exact', head: true });
          var custC = await supa.from('klien').select('id', { count: 'exact', head: true });
          var teamNames = null;
          if (role === 'leadsales' && userId) {
            var uq = await supa.from('app_user').select('id,nama,lead_id,aktif');
            teamNames = []; if (namaUser) teamNames.push(namaUser.trim());
            (uq.data || []).forEach(function (u) { if ((u.lead_id || '').toString().trim() === userId && u.aktif !== false) teamNames.push((u.nama || '').toString().trim()); });
          }
          var latest = {};
          (pq.data || []).forEach(function (r) {
            var no = (r.no_penawaran || '').toString(); if (!no) return;
            var pembuat = (r.dibuat_oleh || '').toString().trim();
            if (!isAdmin && role !== 'leadsales') { if (namaUser && pembuat !== namaUser.trim()) return; }
            else if (role === 'leadsales' && teamNames !== null) { if (teamNames.indexOf(pembuat) < 0) return; }
            var rev = parseInt(r.rev, 10) || 0;
            if (!latest[no] || rev > latest[no]._rev) { r._rev = rev; latest[no] = r; }
          });
          var items = Object.keys(latest).map(function (no) {
            var r = latest[no], kid = (r.klien_id || '').toString();
            return {
              id: no, rev: r._rev, tanggal: _epochJk(_isoDate(r.tanggal)), tanggalDeal: _epochJk(_isoDate(r.tanggal_deal)),
              namaProject: (r.nama_project || '').toString(), klienId: kid, namaKlien: klienMap[kid] || kid,
              dibuatOleh: (r.dibuat_oleh || '').toString(), nilaiKontrak: Math.max(0, (parseFloat(r.subtotal) || 0) - (parseFloat(r.diskon) || 0)),
              grandTotal: parseFloat(r.grand_total) || 0, status: (r.status || 'On-Progress').toString(),
              channelMarketing: (r.channel_marketing || '').toString(), catatanFail: (r.catatan_fail || '').toString()
            };
          });
          return { success: true, items: items, totalProducts: prodC.count || 0, totalCustomers: custC.count || 0, isAdmin: !!isAdmin, namaUser: namaUser || '', isLeadSales: role === 'leadsales', teamNames: teamNames || [] };
        } catch (e) { return { success: false, items: [], totalProducts: 0, totalCustomers: 0, isAdmin: false, namaUser: '' }; }
      }

      async function _salesReportData(params) {
        try {
          params = params || {};
          var isAdmin = !!params.isAdmin, role = (params.role || '').toString(), namaUser = (params.namaUser || '').toString().trim(), userId = (params.userId || '').toString().trim();
          var t = _jkMonthYear();
          var fromISO = _isoDate(params.dateFrom) || (t.yr + '-' + ('0' + (t.mo + 1)).slice(-2) + '-01');
          var toISO = _isoDate(params.dateTo) || _todayIso();
          var todayISO = _todayIso();

          var pq = await _all('penawaran', '*'); if (pq.error) return { success: false, error: pq.error.message };
          var kq = await _all('klien', 'id,nama_klien');
          var uq = await supa.from('app_user').select('id,nama,role,aktif,target_bulanan,lead_id');
          var klienMap = {}; (kq.data || []).forEach(function (k) { if (k.id != null) klienMap[k.id.toString()] = k.nama_klien || ''; });
          var userMap = {}, leadSalesCount = 0;
          (uq.data || []).forEach(function (u) {
            var nm = (u.nama || '').toString().trim(); if (!nm) return;
            userMap[nm] = { target: Number(u.target_bulanan) || 0 };
            if (u.aktif !== false && (u.role || '') === 'leadsales') leadSalesCount++;
          });
          var teamNames = null;
          if (role === 'leadsales') {
            teamNames = []; if (namaUser) teamNames.push(namaUser);
            (uq.data || []).forEach(function (u) { if ((u.lead_id || '').toString().trim() === userId && u.aktif !== false) teamNames.push((u.nama || '').toString().trim()); });
          }

          // latest rev per no_penawaran
          var latest = {};
          (pq.data || []).forEach(function (r) { var no = (r.no_penawaran || '').toString().trim(); if (!no) return; var rev = parseInt(r.rev, 10) || 0; if (!latest[no] || rev > latest[no]._rev) { r._rev = rev; latest[no] = r; } });
          var rows = Object.keys(latest).map(function (k) { return latest[k]; });

          var salesMap = {};
          function ensureSales(nm) { if (!salesMap[nm]) salesMap[nm] = { nama: nm, targetBulanan: (userMap[nm] ? userMap[nm].target : 0), totalPenawaran: 0, totalNilaiPenawaran: 0, dealCount: 0, dealRevenue: 0, dealHpp: 0, dealMarginSum: 0, dealMarginCount: 0, pipelineCount: 0, pipelineValue: 0, failCount: 0, dealCohort: 0, _pen: {} }; return salesMap[nm]; }

          rows.forEach(function (r) {
            var pembuat = (r.dibuat_oleh || '').toString().trim();
            if (!_accOK(pembuat, isAdmin, role, namaUser, teamNames)) return;
            var s = ensureSales(pembuat);
            var no = (r.no_penawaran || '').toString().trim();
            var status = (r.status || 'On-Progress').toString();
            var nilaiKontrak = Math.max(0, (parseFloat(r.subtotal) || 0) - (parseFloat(r.diskon) || 0));
            var grandTotal = parseFloat(r.grand_total) || 0, totalHpp = parseFloat(r.total_hpp) || 0;
            var tglISO = _isoDate(r.tanggal), dealISO = _isoDate(r.tanggal_deal), failISO = _isoDate(r.tanggal_fail);
            var effDealISO = dealISO || tglISO;
            var kid = (r.klien_id || '').toString();
            var creationInRange = _dInRange(tglISO, fromISO, toISO);
            var dealInRange = status === 'Deal' && _dInRange(effDealISO, fromISO, toISO);
            var endISO = status === 'Deal' ? dealISO : (status === 'Fail' ? failISO : null);
            var cyc = (tglISO && endISO) ? Math.max(0, _dDaysISO(tglISO, endISO)) : null;
            var pObj = {
              id: no, rev: r._rev, tanggal: _fmtTgl(tglISO), tanggalDeal: _fmtTgl(dealISO), namaProject: (r.nama_project || '').toString(),
              namaKlien: klienMap[kid] || kid, nilaiKontrak: nilaiKontrak, grandTotal: grandTotal, totalHpp: totalHpp,
              estimasiProfit: parseFloat(r.estimasi_keuntungan) || 0, marginPersen: parseFloat(r.margin_persen) || 0, status: status,
              noWO: (r.no_wo || '').toString(), catatanFail: (r.catatan_fail || '').toString(), kodeWin: (r.kode_win || '').toString(),
              catatanWin: (r.catatan_win || '').toString(), kodeLost: (r.kode_lost || '').toString(), tanggalFail: _fmtTgl(failISO),
              lessonLearned: (r.lesson_learned || '').toString(), action: (r.action || '').toString(),
              dealInPeriod: dealInRange && !creationInRange, salesCycleDays: cyc
            };
            var masukList = (status === 'Deal') ? dealInRange : creationInRange;
            if (masukList && !s._pen[no]) s._pen[no] = pObj;
            if (creationInRange) { s.totalPenawaran++; s.totalNilaiPenawaran += nilaiKontrak; if (status === 'Fail') s.failCount++; if (status === 'Deal') s.dealCohort++; }
            if (dealInRange) { s.dealCount++; s.dealRevenue += nilaiKontrak; s.dealHpp += totalHpp;
              if (nilaiKontrak > 0) { s.dealMarginSum += ((nilaiKontrak - totalHpp) / nilaiKontrak) * 100; s.dealMarginCount++; } }
            if (status === 'On-Progress') { s.pipelineCount++; s.pipelineValue += nilaiKontrak; }
          });

          var statusOrder = { 'Deal': 0, 'On-Progress': 1, 'Fail': 2 };
          var teamCycleSum = 0, teamCycleCount = 0;
          var salesList = Object.keys(salesMap).map(function (nm) {
            var s = salesMap[nm];
            var pen = Object.keys(s._pen).map(function (k) { return s._pen[k]; });
            pen.sort(function (a, b) { var sa = statusOrder[a.status] !== undefined ? statusOrder[a.status] : 9, sb = statusOrder[b.status] !== undefined ? statusOrder[b.status] : 9; if (sa !== sb) return sa - sb; return (b.grandTotal || 0) - (a.grandTotal || 0); });
            var cycleSum = 0, cycleCount = 0;
            pen.forEach(function (p) { if (p.salesCycleDays !== null && p.status === 'Deal') { cycleSum += p.salesCycleDays; cycleCount++; } });
            teamCycleSum += cycleSum; teamCycleCount += cycleCount;
            return {
              nama: s.nama, targetBulanan: s.targetBulanan, totalPenawaran: s.totalPenawaran, totalNilaiPenawaran: s.totalNilaiPenawaran,
              avgNilaiPenawaran: s.totalPenawaran > 0 ? s.totalNilaiPenawaran / s.totalPenawaran : 0,
              dealCount: s.dealCount, dealRevenue: s.dealRevenue, dealHpp: s.dealHpp, dealMarginSum: s.dealMarginSum, dealMarginCount: s.dealMarginCount, pipelineCount: s.pipelineCount, pipelineValue: s.pipelineValue,
              failCount: s.failCount, dealCohort: s.dealCohort,
              winRate: s.totalPenawaran > 0 ? (s.dealCohort / s.totalPenawaran) * 100 : 0,
              // Rata-rata SEDERHANA: mean margin per deal (tiap deal bobot sama).
              avgMarginDeal: s.dealMarginCount > 0 ? (s.dealMarginSum / s.dealMarginCount) : null,
              avgSalesCycle: cycleCount > 0 ? cycleSum / cycleCount : null,
              achievement: s.targetBulanan > 0 ? (s.dealRevenue / s.targetBulanan) * 100 : null,
              penawaran: pen
            };
          });
          salesList.sort(function (a, b) { return b.dealRevenue - a.dealRevenue; });

          // team summary
          var teamRevenue = 0, teamHppDeal = 0, teamPenawaran = 0, teamDealCount = 0, teamDealCohort = 0, teamPipelineValue = 0, teamPipelineCount = 0, teamMarginSum = 0, teamMarginCount = 0;
          salesList.forEach(function (s) { teamRevenue += s.dealRevenue; teamHppDeal += s.dealHpp; teamPenawaran += s.totalPenawaran; teamDealCount += s.dealCount; teamDealCohort += s.dealCohort; teamPipelineValue += s.pipelineValue; teamPipelineCount += s.pipelineCount; teamMarginSum += s.dealMarginSum; teamMarginCount += s.dealMarginCount; });
          var teamTarget = 0;
          if (isAdmin) { Object.keys(userMap).forEach(function (nm) { teamTarget += userMap[nm].target; }); }
          else if (role === 'leadsales' && teamNames && teamNames.length) { teamNames.forEach(function (nm) { teamTarget += (userMap[nm] ? userMap[nm].target : 0); }); }
          else { teamTarget = userMap[namaUser] ? userMap[namaUser].target : 0; }

          // pipeline health
          var agingBuckets = [{ label: '0–30 hari', min: 0, max: 30, count: 0, value: 0 }, { label: '31–60 hari', min: 31, max: 60, count: 0, value: 0 }, { label: '61–90 hari', min: 61, max: 90, count: 0, value: 0 }, { label: '>90 hari', min: 91, max: 3650000, count: 0, value: 0 }];
          var staleOffers = [];
          rows.forEach(function (r) {
            if ((r.status || '') !== 'On-Progress') return;
            var pembuat = (r.dibuat_oleh || '').toString().trim();
            if (!_accOK(pembuat, isAdmin, role, namaUser, teamNames)) return;
            var rowISO = _isoDate(r.tanggal); var umur = Math.max(0, _dDaysISO(rowISO, todayISO) || 0);
            var agNilai = Math.max(0, (parseFloat(r.subtotal) || 0) - (parseFloat(r.diskon) || 0));
            var kid = (r.klien_id || '').toString();
            for (var bi = 0; bi < agingBuckets.length; bi++) { if (umur >= agingBuckets[bi].min && umur <= agingBuckets[bi].max) { agingBuckets[bi].count++; agingBuckets[bi].value += agNilai; break; } }
            if (umur >= 30) staleOffers.push({ id: (r.no_penawaran || '').toString(), sales: pembuat, klien: klienMap[kid] || kid, project: (r.nama_project || '').toString(), nilai: agNilai, umurHari: umur, tanggal: _fmtTgl(rowISO) });
          });
          staleOffers.sort(function (a, b) { return b.umurHari - a.umurHari; });
          var sisaTarget = Math.max(0, teamTarget - teamRevenue);
          var staleValue = staleOffers.reduce(function (x, o) { return x + o.nilai; }, 0);
          var pipelineHealth = {
            pipelineValue: teamPipelineValue, pipelineCount: teamPipelineCount, sisaTarget: sisaTarget, targetTercapai: sisaTarget <= 0,
            coverage: sisaTarget > 0 ? teamPipelineValue / sisaTarget : null,
            aging: agingBuckets.map(function (b) { return { label: b.label, count: b.count, value: b.value }; }),
            staleDays: 30, staleCount: staleOffers.length, staleValue: staleValue, staleOffers: staleOffers
          };

          // trend 3 bulan (deal-date, nilaiKontrak) — trailing termasuk bulan ini
          var months = [];
          for (var i = 2; i >= 0; i--) { var mm = t.mo - i, yy = t.yr; while (mm < 0) { mm += 12; yy--; } months.push({ key: yy + '-' + ('0' + (mm + 1)).slice(-2), label: _BULAN_ID[mm], val: 0 }); }
          rows.forEach(function (r) {
            if ((r.status || '') !== 'Deal') return;
            var pembuat = (r.dibuat_oleh || '').toString().trim();
            if (!_accOK(pembuat, isAdmin, role, namaUser, teamNames)) return;
            var dISO = _isoDate(r.tanggal_deal) || _isoDate(r.tanggal); if (!dISO) return;
            var key = dISO.slice(0, 7), nk = Math.max(0, (parseFloat(r.subtotal) || 0) - (parseFloat(r.diskon) || 0));
            for (var mi = 0; mi < months.length; mi++) { if (months[mi].key === key) { months[mi].val += nk; break; } }
          });

          // recent deals (deal-date in range, top 5 by grand_total)
          var recent = [];
          rows.forEach(function (r) {
            if ((r.status || '') !== 'Deal') return;
            var pembuat = (r.dibuat_oleh || '').toString().trim();
            if (!_accOK(pembuat, isAdmin, role, namaUser, teamNames)) return;
            var dISO = _isoDate(r.tanggal_deal) || _isoDate(r.tanggal);
            if (!_dInRange(dISO, fromISO, toISO)) return;
            var kid = (r.klien_id || '').toString();
            recent.push({ namaProject: (r.nama_project || '').toString(), namaKlien: klienMap[kid] || kid, grandTotal: parseFloat(r.grand_total) || 0, dibuatOleh: pembuat, tanggalDeal: _fmtTgl(dISO) });
          });
          recent.sort(function (a, b) { return b.grandTotal - a.grandTotal; }); recent = recent.slice(0, 5);

          return {
            success: true, dateFrom: _fmtTgl(fromISO), dateTo: _fmtTgl(toISO),
            summary: {
              teamRevenue: teamRevenue, teamTarget: teamTarget, teamPenawaran: teamPenawaran, teamDealCount: teamDealCount,
              teamWinRate: teamPenawaran > 0 ? (teamDealCohort / teamPenawaran) * 100 : 0,
              teamPipelineValue: teamPipelineValue, teamPipelineCount: teamPipelineCount,
              teamAvgMarginDeal: teamMarginCount > 0 ? (teamMarginSum / teamMarginCount) : 0,
              teamAvgSalesCycle: teamCycleCount > 0 ? teamCycleSum / teamCycleCount : null, leadSalesCount: leadSalesCount
            },
            trend: { labels: months.map(function (m) { return m.label; }), values: months.map(function (m) { return m.val; }) },
            salesList: salesList, recentDeals: recent, pipelineHealth: pipelineHealth, isAdmin: isAdmin
          };
        } catch (e) { return { success: false, error: (e && e.message) || String(e) }; }
      }

      window.gsRoute('getDashboardRawData', { mode: 'fn', handler: async function (a) { return await _dashboardRawData(a[0], a[1], a[2], a[3]); } });
      window.gsRoute('getSalesReportData', { mode: 'fn', handler: async function (a) { return await _salesReportData(a[0] || {}); } });
      window.gsRoute('getDashboardData', {
        mode: 'fn',
        handler: async function (a) {
          var params = a[0] || {};
          try { var raw = await _dashboardRawData(params.namaUser, params.isAdmin, params.role, params.userId); var sales = await _salesReportData(params); return { raw: raw, sales: sales }; }
          catch (e) { return { raw: { success: false, items: [] }, sales: { success: false } }; }
        }
      });
