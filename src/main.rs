use axum::{Router, routing::get, response::IntoResponse};
use std::net::SocketAddr;
use tower_http::{
    services::ServeDir,
    cors::{CorsLayer},
    compression::CompressionLayer,
    trace::TraceLayer,
};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

mod config;

#[tokio::main]
async fn main() {
    // 初始化日志
    tracing_subscriber::registry()
        .with(EnvFilter::try_from_default_env()
            .unwrap_or_else(|_| "petsoul_website=info,tower_http=info".into()))
        .with(tracing_subscriber::fmt::layer())
        .init();

    let config = config::Config::from_env();

    let app = Router::new()
        // 健康检查
        .route("/health", get(health_check))
        // 静态文件服务 (Axum 0.8 使用 fallback_service 替代 nest_service at root)
        .fallback_service(ServeDir::new("static"))
        // 中间件
        .layer(CorsLayer::permissive())
        .layer(CompressionLayer::new())
        .layer(TraceLayer::new_for_http());

    let addr = SocketAddr::from(([0, 0, 0, 0], config.port));
    tracing::info!("Petsoul 官网启动: http://{}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

async fn health_check() -> impl IntoResponse {
    "OK"
}
