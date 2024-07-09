import React from "react";
import PropTypes from "prop-types";
import { GatsbyImage } from "gatsby-plugin-image";

export default function FullWidthImage(props) {
  const {
    height = 400,
    img,
    title,
    subheading,
    imgPosition = "top left",
  } = props;

  return (
    <React.Fragment>
      <div
        className="full-width-image-container"
        style={{
          height: `${height}px`,
        }}
      >
        {img?.url ? (
          <img
            src={img}
            style={{
              gridArea: "1/1",
              objectFit: "cover",
              objectPosition: imgPosition,
              height: "100%",
              width: "100%",
            }}
            alt=""
          />
        ) : (
          <GatsbyImage
            image={img}
            style={{
              gridArea: "1/1",
              objectFit: "cover",
              objectPosition: imgPosition,
              height: "100%",
              width: "100%",
            }}
            layout="fullWidth"
            alt=""
            formats={["auto", "webp", "avif"]}
          />
        )}
        {(title || subheading) && (
          <div
            className="title-container"
            style={{
              gridArea: "1/1",
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              textAlign: "center",
              color: "white",
              textShadow: "2px 2px 4px rgba(0, 0, 0, 0.5)",
              padding: "1rem",
            }}
          >
            {title && (
              <h1
                className="has-text-weight-bold title"
                style={{
                  backgroundColor: "#7035CC",
                  padding: "0.25em",
                  marginBottom: "0.5rem",
                }}
              >
                {title}
              </h1>
            )}
            {subheading && (
              <h3
                className="has-text-weight-bold subheading"
                style={{
                  backgroundColor: "#7035CC",
                  padding: "0.25rem",
                }}
              >
                {subheading}
              </h3>
            )}
          </div>
        )}
      </div>
    </React.Fragment>
  );
}

FullWidthImage.propTypes = {
  img: PropTypes.oneOfType([PropTypes.object, PropTypes.string]),
  title: PropTypes.string,
  height: PropTypes.number,
  subheading: PropTypes.string,
};