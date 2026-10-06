document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('crawl-form');
    const urlInput = document.getElementById('url-input');
    const scanBtn = document.getElementById('scan-btn');
    const statusPanel = document.getElementById('status-panel');
    const resultsPanel = document.getElementById('results-panel');
    const currentUrlEl = document.getElementById('current-url');
    const statusText = document.getElementById('status-text');
    const statScanned = document.getElementById('stat-scanned');
    const statGood = document.getElementById('stat-good');
    const statBroken = document.getElementById('stat-broken');
    const resultsBody = document.getElementById('results-body');
    const noResultsMsg = document.getElementById('no-results-msg');
    const resultsTable = document.getElementById('results-table');
    const exportBtn = document.getElementById('export-btn');
    
    let eventSource = null;
    let brokenLinksData = [];

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        
        const url = urlInput.value.trim();
        if (!url) return;

        // Reset UI
        statusPanel.classList.remove('hidden');
        resultsPanel.classList.remove('hidden');
        resultsTable.classList.remove('hidden');
        noResultsMsg.classList.add('hidden');
        
        resultsBody.innerHTML = '';
        statScanned.textContent = '0';
        statGood.textContent = '0';
        statBroken.textContent = '0';
        brokenLinksData = [];
        exportBtn.classList.add('hidden');
        
        scanBtn.disabled = true;
        scanBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Scanning...';
        
        // Close previous connection if exists
        if (eventSource) {
            eventSource.close();
        }

        // Connect to SSE endpoint
        eventSource = new EventSource(`/api/crawl?url=${encodeURIComponent(url)}`);

        eventSource.onmessage = (event) => {
            const data = JSON.parse(event.data);
            
            switch (data.type) {
                case 'info':
                    statusText.textContent = data.message;
                    break;
                case 'scanning':
                    currentUrlEl.textContent = data.url;
                    statScanned.textContent = parseInt(statScanned.textContent) + 1;
                    break;
                case 'good_link':
                    statGood.textContent = parseInt(statGood.textContent) + 1;
                    break;
                case 'broken_link':
                    const brokenCount = parseInt(statBroken.textContent) + 1;
                    statBroken.textContent = brokenCount;
                    brokenLinksData.push({
                        status: data.status,
                        text: data.text,
                        link: data.link,
                        source: data.source
                    });
                    addBrokenLinkRow(data.status, data.text, data.link, data.source);
                    break;
                case 'done':
                    finishScan(data.message);
                    break;
            }
        };

        eventSource.onerror = (err) => {
            console.error("SSE Error:", err);
            finishScan("Connection lost or scan error");
        };
    });

    function addBrokenLinkRow(status, text, link, source) {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td><span class="status-badge">${status}</span></td>
            <td class="text-cell" title="${text}">${text || 'N/A'}</td>
            <td class="link-cell"><a href="${link}" target="_blank" title="${link}">${link}</a></td>
            <td class="source-cell" title="${source}">${source}</td>
        `;
        resultsBody.appendChild(row);
    }

    function finishScan(msg) {
        if (eventSource) {
            eventSource.close();
        }
        
        scanBtn.disabled = false;
        scanBtn.innerHTML = '<span>Scan Again</span><i class="fa-solid fa-arrow-rotate-right"></i>';
        
        statusText.textContent = msg || "Scan Finished";
        document.querySelector('.pulse').style.animation = 'none';
        document.querySelector('.pulse').style.backgroundColor = 'var(--success)';
        
        const brokenCount = parseInt(statBroken.textContent);
        if (brokenCount === 0) {
            resultsTable.classList.add('hidden');
            noResultsMsg.classList.remove('hidden');
        } else {
            exportBtn.classList.remove('hidden');
        }
    }

    exportBtn.addEventListener('click', () => {
        if (brokenLinksData.length === 0) return;
        
        const headers = ['Status', 'Clicked Element', 'Broken Link URL', 'Found On Page'];
        const csvRows = [headers.join(',')];
        
        for (const row of brokenLinksData) {
            const escapeCsv = (str) => {
                const stringified = String(str || '').replace(/"/g, '""');
                return `"${stringified}"`;
            };
            
            const rowData = [
                escapeCsv(row.status),
                escapeCsv(row.text),
                escapeCsv(row.link),
                escapeCsv(row.source)
            ];
            
            csvRows.push(rowData.join(','));
        }
        
        const csvContent = csvRows.join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', 'broken_links_report.csv');
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    });
});
