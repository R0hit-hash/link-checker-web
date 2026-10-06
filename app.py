from flask import Flask, render_template, request, Response, jsonify
import requests
from bs4 import BeautifulSoup
from urllib.parse import urljoin, urlparse
import json
import time

app = Flask(__name__)

def get_all_links(url):
    try:
        headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
        response = requests.get(url, headers=headers, timeout=10)
        
        if 'text/html' not in response.headers.get('Content-Type', ''):
            return []
            
        soup = BeautifulSoup(response.text, 'html.parser')
        links = []
        seen_urls = set()
        for a_tag in soup.find_all(['a', 'button']):
            href = a_tag.get('href')
            if not href:
                onclick = a_tag.get('onclick', '')
                if 'window.location' in onclick or 'location.href' in onclick:
                    # Very basic extraction for buttons, e.g., onclick="window.location='url'"
                    try:
                        href = onclick.split("'")[1]
                    except IndexError:
                        continue
                else:
                    continue
            
            if href.startswith(('javascript:', 'mailto:', 'tel:')):
                continue
            
            full_url = urljoin(url, href).split('#')[0]
            if full_url not in seen_urls:
                seen_urls.add(full_url)
                
                text = a_tag.get_text(strip=True)
                if not text:
                    text = a_tag.get('title', '')
                if not text:
                    img = a_tag.find('img')
                    if img and img.get('alt'):
                        text = img.get('alt')
                if not text:
                    text = 'Empty/Icon Element'
                    
                links.append({'url': full_url, 'text': text})
        return links
    except Exception:
        return []

def check_link(url):
    try:
        headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
        response = requests.head(url, headers=headers, allow_redirects=True, timeout=5)
        if response.status_code == 405 or response.status_code >= 400:
             response = requests.get(url, headers=headers, allow_redirects=True, stream=True, timeout=5)
        return response.status_code
    except Exception:
        return None

def extract_urls_from_sitemap(sitemap_url):
    try:
        headers = {'User-Agent': 'Mozilla/5.0'}
        response = requests.get(sitemap_url, headers=headers, timeout=10)
        soup = BeautifulSoup(response.content, 'html.parser')
        return [loc.text for loc in soup.find_all('loc')]
    except Exception:
        return []

def generate_crawl_events(start_url):
    visited = set()
    checked_links = {}
    domain = urlparse(start_url).netloc
    
    is_sitemap = start_url.endswith('.xml')
    
    if is_sitemap:
        yield f"data: {json.dumps({'type': 'info', 'message': f'Parsing sitemap {start_url}...'})}\n\n"
        to_visit = extract_urls_from_sitemap(start_url)
    else:
        to_visit = [start_url]
        yield f"data: {json.dumps({'type': 'info', 'message': f'Starting crawl on {start_url}...'})}\n\n"
    
    while to_visit:
        current_url = to_visit.pop(0)
        if current_url in visited:
            continue
            
        visited.add(current_url)
        
        yield f"data: {json.dumps({'type': 'scanning', 'url': current_url})}\n\n"
        
        links_on_page = get_all_links(current_url)
        
        for item in links_on_page:
            link = item['url']
            text = item['text']
            
            if link not in checked_links:
                status = check_link(link)
                checked_links[link] = status
            else:
                status = checked_links[link]
            
            if status is None or status >= 400:
                yield f"data: {json.dumps({'type': 'broken_link', 'source': current_url, 'link': link, 'text': text, 'status': status or 'Failed'})}\n\n"
            else:
                yield f"data: {json.dumps({'type': 'good_link', 'source': current_url, 'link': link, 'status': status})}\n\n"
                
    yield f"data: {json.dumps({'type': 'done', 'message': 'Scan completed!'})}\n\n"

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/crawl')
def crawl():
    url = request.args.get('url')
    if not url:
        return jsonify({'error': 'URL is required'}), 400
    if not url.startswith('http'):
        url = 'https://' + url
    
    return Response(generate_crawl_events(url), mimetype='text/event-stream')

if __name__ == '__main__':
    app.run(debug=True, port=5000)
