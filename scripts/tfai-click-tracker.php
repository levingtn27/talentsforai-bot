<?php
/**
 * Plugin Name: TFAI Apply Click Tracker
 * Description: Injects GA4 event tracking on all Apply Now buttons sitewide.
 * Version: 1.0
 *
 * INSTALL: Upload to /wp-content/mu-plugins/tfai-click-tracker.php
 *
 * HOW IT WORKS:
 *   - Finds every <a> whose href contains "sme.careers/apply" or text "Apply Now"
 *   - Fires a GA4 custom event: apply_click { job_title, job_url }
 *   - GA4 must already be installed on the site (via gtag.js or Google Tag Manager)
 */

// ─── REST endpoint to record a click ─────────────────────────────────────────
add_action('rest_api_init', function () {
    register_rest_route('tfai/v1', '/click', [
        'methods'             => 'POST',
        'callback'            => 'tfai_record_click',
        'permission_callback' => '__return_true', // public — no auth needed for click recording
        'args' => [
            'job_title' => ['required' => true,  'type' => 'string'],
            'job_url'   => ['required' => false, 'type' => 'string'],
        ],
    ]);

    // GET click counts (authenticated — bot reads this)
    register_rest_route('tfai/v1', '/clicks', [
        'methods'             => 'GET',
        'callback'            => 'tfai_get_clicks',
        'permission_callback' => function () {
            return current_user_can('edit_posts');
        },
    ]);
});

function tfai_record_click(WP_REST_Request $request): WP_REST_Response {
    $title = sanitize_text_field($request->get_param('job_title'));
    $url   = esc_url_raw($request->get_param('job_url') ?? '');

    if (empty($title)) {
        return new WP_REST_Response(['error' => 'job_title required'], 400);
    }

    $key    = 'tfai_clicks_' . md5($title);
    $counts = get_option('tfai_click_counts', []);

    if (!isset($counts[$title])) {
        $counts[$title] = ['total' => 0, 'weekly' => [], 'url' => $url];
    }

    $counts[$title]['total']++;
    $counts[$title]['url'] = $url ?: $counts[$title]['url'];

    // Track weekly counts — keyed by ISO week (e.g. "2026-W18")
    $week = date('Y-\WW');
    $counts[$title]['weekly'][$week] = ($counts[$title]['weekly'][$week] ?? 0) + 1;

    // Keep only last 8 weeks to avoid bloat
    if (count($counts[$title]['weekly']) > 8) {
        $counts[$title]['weekly'] = array_slice($counts[$title]['weekly'], -8, null, true);
    }

    update_option('tfai_click_counts', $counts, false);

    return new WP_REST_Response(['success' => true], 200);
}

function tfai_get_clicks(WP_REST_Request $request): WP_REST_Response {
    $counts = get_option('tfai_click_counts', []);
    $period = sanitize_text_field($request->get_param('period') ?? 'week');
    $week   = date('Y-\WW');

    $result = [];
    foreach ($counts as $title => $data) {
        $result[] = [
            'job_title'    => $title,
            'total_clicks' => $data['total'],
            'this_week'    => $data['weekly'][$week] ?? 0,
            'last_week'    => $data['weekly'][tfai_prev_week()] ?? 0,
            'url'          => $data['url'] ?? '',
        ];
    }

    // Sort by this week's clicks descending
    usort($result, fn($a, $b) => $b['this_week'] - $a['this_week']);

    return new WP_REST_Response($result, 200);
}

function tfai_prev_week(): string {
    return date('Y-\WW', strtotime('-1 week'));
}

// ─── JS: fire click events to our REST endpoint ───────────────────────────────
add_action('wp_footer', 'tfai_inject_click_tracker', 99);

function tfai_inject_click_tracker() {
    $endpoint = esc_url(rest_url('tfai/v1/click'));
    ?>
    <script>
    (function () {
        var endpoint = <?php echo json_encode($endpoint); ?>;

        function trackApplyClicks() {
            // Match by href pattern OR by button/link text containing "apply"
            var allLinks = document.querySelectorAll('a, button');
            allLinks.forEach(function (link) {
                if (link.dataset.tfaiTracked) return;

                var href = link.href || '';
                var text = link.textContent?.trim().toLowerCase() || '';
                var isApplyLink = 
                    href.includes('sme.careers') ||
                    href.includes('mercor.com') ||
                    href.includes('talentsforai.com/apply') ||
                    text === 'apply now' ||
                    text === 'apply' ||
                    text === 'apply for this job';

                if (!isApplyLink) return;

                link.dataset.tfaiTracked = '1';

                link.addEventListener('click', function () {
                    var jobTitle =
                        link.dataset.jobTitle ||
                        resolveJobTitle(link) ||
                        document.title;

                    navigator.sendBeacon
                        ? navigator.sendBeacon(endpoint, new Blob(
                            [JSON.stringify({ job_title: jobTitle, job_url: href })],
                            { type: 'application/json' }
                          ))
                        : fetch(endpoint, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ job_title: jobTitle, job_url: href }),
                            keepalive: true,
                          }).catch(function(){});
                });
            });
        }

        function resolveJobTitle(link) {
            var el = link.parentElement;
            var depth = 0;
            while (el && depth < 8) {
                var heading = el.querySelector('h1,h2,h3,h4,.job-title,.entry-title');
                if (heading) return heading.textContent.trim();
                el = el.parentElement;
                depth++;
            }
            return null;
        }

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', trackApplyClicks);
        } else {
            trackApplyClicks();
        }

        var observer = new MutationObserver(trackApplyClicks);
        observer.observe(document.body, { childList: true, subtree: true });
    })();
    </script>
    <?php
}
