<?php
/**
 * Plugin Name: TFAI Bot Sync
 * Description: Exposes REST endpoint for Telegram bot to update homepage copy sections.
 * Version: 1.0
 *
 * INSTALL: Upload this file to /wp-content/mu-plugins/tfai-bot-sync.php
 * It loads automatically — no activation needed.
 *
 * SECURITY: Uses the same WP Application Password auth as the bot.
 * Only authenticated requests with edit_posts capability can write.
 */

add_action('rest_api_init', function () {

    // GET all copy sections
    register_rest_route('tfai/v1', '/copy', [
        'methods'             => 'GET',
        'callback'            => 'tfai_get_copy',
        'permission_callback' => function () {
            return current_user_can('edit_posts');
        },
    ]);

    // POST update a copy section
    register_rest_route('tfai/v1', '/copy', [
        'methods'             => 'POST',
        'callback'            => 'tfai_update_copy',
        'permission_callback' => function () {
            return current_user_can('edit_posts');
        },
        'args' => [
            'section' => ['required' => true,  'type' => 'string'],
            'text'    => ['required' => true,  'type' => 'string'],
        ],
    ]);

    // GET Site Kit analytics summary
    register_rest_route('tfai/v1', '/analytics', [
        'methods'             => 'GET',
        'callback'            => 'tfai_get_analytics',
        'permission_callback' => function () {
            return current_user_can('edit_posts');
        },
    ]);
});

$TFAI_SECTIONS = [
    'hero_title', 'hero_sub', 'stats',
    'hiw_step1', 'hiw_step2', 'hiw_step3',
    'cta',
];

function tfai_get_copy(WP_REST_Request $request): WP_REST_Response {
    global $TFAI_SECTIONS;
    $data = [];
    foreach ($TFAI_SECTIONS as $key) {
        $data[$key] = get_option("tfai_copy_{$key}", '');
    }
    return new WP_REST_Response($data, 200);
}

function tfai_update_copy(WP_REST_Request $request): WP_REST_Response {
    global $TFAI_SECTIONS;
    $section = sanitize_key($request->get_param('section'));
    $text    = sanitize_text_field($request->get_param('text'));

    if (!in_array($section, $TFAI_SECTIONS, true)) {
        return new WP_REST_Response(['error' => 'Invalid section'], 400);
    }

    update_option("tfai_copy_{$section}", $text, false);

    // Log the change with timestamp
    $log   = get_option('tfai_copy_log', []);
    $log[] = [
        'section'   => $section,
        'text'      => $text,
        'timestamp' => current_time('mysql'),
        'user'      => get_current_user_id(),
    ];
    // Keep last 100 entries
    update_option('tfai_copy_log', array_slice($log, -100), false);

    return new WP_REST_Response([
        'success' => true,
        'section' => $section,
        'text'    => $text,
    ], 200);
}

/**
 * Site Kit analytics — reads cached data from WP options
 * Site Kit stores GA4 report data in options prefixed with googlesitekit_
 */
function tfai_get_analytics(WP_REST_Request $request): WP_REST_Response {
    $result = [];

    // Site Kit stores module data in these option keys
    $possible_keys = [
        'googlesitekit_analytics-4_report',
        'googlesitekit-analytics-4',
        'googlesitekit_analytics_report',
        'googlesitekit_analytics',
    ];

    // Scan all googlesitekit options to find what's available
    global $wpdb;
    $sitekit_options = $wpdb->get_results(
        "SELECT option_name, option_value FROM {$wpdb->options} 
         WHERE option_name LIKE 'googlesitekit%' 
         AND option_name NOT LIKE '%oauth%'
         AND option_name NOT LIKE '%token%'
         AND option_name NOT LIKE '%auth%'
         LIMIT 20",
        ARRAY_A
    );

    $analytics_data = [];
    foreach ($sitekit_options as $row) {
        $value = maybe_unserialize($row['option_value']);
        if (is_array($value) || is_object($value)) {
            $analytics_data[$row['option_name']] = $value;
        }
    }

    // Try to extract key metrics from whatever Site Kit has cached
    $visitors   = null;
    $pageviews  = null;
    $top_pages  = [];

    foreach ($analytics_data as $key => $data) {
        $data = (array) $data;

        // Look for visitor/session counts
        if (isset($data['totalUsers'])) $visitors  = $data['totalUsers'];
        if (isset($data['sessions']))   $visitors  = $data['sessions'];
        if (isset($data['screenPageViews'])) $pageviews = $data['screenPageViews'];
        if (isset($data['pageviews']))  $pageviews = $data['pageviews'];

        // Look for top pages
        if (isset($data['rows']) && is_array($data['rows'])) {
            foreach (array_slice($data['rows'], 0, 5) as $row) {
                $row = (array) $row;
                if (isset($row['dimensionValues']) && isset($row['metricValues'])) {
                    $top_pages[] = [
                        'page'  => is_array($row['dimensionValues']) ? ($row['dimensionValues'][0]['value'] ?? '') : '',
                        'views' => is_array($row['metricValues'])    ? ($row['metricValues'][0]['value']    ?? 0)  : 0,
                    ];
                }
            }
        }
    }

    // If Site Kit data not found, return available option keys for debugging
    if (empty($analytics_data)) {
        return new WP_REST_Response([
            'status'  => 'no_data',
            'message' => 'Site Kit has not cached any analytics data yet. Visit WP Admin → Site Kit to trigger a data refresh.',
        ], 200);
    }

    return new WP_REST_Response([
        'status'     => 'ok',
        'visitors'   => $visitors,
        'pageviews'  => $pageviews,
        'top_pages'  => $top_pages,
        'keys_found' => array_keys($analytics_data),
    ], 200);
}

/**
 * Usage in your Generate Blocks / theme:
 *
 *   $hero_title = get_option('tfai_copy_hero_title', 'Connecting global experts with AI jobs');
 *   $hero_sub   = get_option('tfai_copy_hero_sub',   'Flexible · Remote · Competitive pay');
 *
 * Or use a shortcode: [tfai_copy section="hero_title"]
 */
add_shortcode('tfai_copy', function ($atts) {
    $atts = shortcode_atts(['section' => ''], $atts);
    $key  = sanitize_key($atts['section']);
    return esc_html(get_option("tfai_copy_{$key}", ''));
});
